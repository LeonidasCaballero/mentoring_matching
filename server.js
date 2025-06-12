const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Flag para activar logs detallados: export DEBUG_LOGS=true
const DEBUG = process.env.DEBUG_LOGS === 'true';

// Método de importación dinámica para p-limit (compatible con ESM)
let pLimit;
(async () => {
  try {
    const pLimitModule = await import('p-limit');
    pLimit = pLimitModule.default;
    console.log('p-limit importado correctamente');
  } catch (error) {
    console.error('Error importando p-limit:', error);
    // Implementación de respaldo si p-limit falla
    pLimit = (concurrency) => {
      const queue = [];
      let activeCount = 0;
    
      const next = () => {
        activeCount--;
        if (queue.length > 0) {
          queue.shift()();
        }
      };
    
      return (fn) => {
        return (...args) => {
          return new Promise((resolve, reject) => {
            const run = async () => {
              activeCount++;
              try {
                const result = await fn(...args);
                resolve(result);
              } catch (error) {
                reject(error);
              }
              next();
            };
    
            if (activeCount < concurrency) {
              run();
            } else {
              queue.push(run);
            }
          });
        };
      };
    };
    console.log('Usando implementación de respaldo para p-limit');
  }
})();

const app = express();
const port = process.env.PORT || 5002;

// Middleware - aumentar límites de tamaño de solicitud
app.use(cors({
  origin: '*',  // Permitir cualquier origen temporalmente para diagnóstico
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Aumentar significativamente los límites de tamaño
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Inicializar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Supabase admin client (read-only fields)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// ================= EMBEDDINGS SETUP =================
let mentorEmbeddings = new Map();

(() => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'mentor_embeddings.json'), 'utf8');
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      parsed.forEach((item) => {
        const id = item.id || item.mentor_id || item.mentorId;
        const vector = item.embedding || item.vector || item.embedding_vector;
        if (id && Array.isArray(vector)) {
          mentorEmbeddings.set(id, vector);
        }
      });
    } else {
      // Si es objeto {id: vector}
      Object.entries(parsed).forEach(([id, vector]) => {
        if (Array.isArray(vector)) {
          mentorEmbeddings.set(id, vector);
        }
      });
    }
    console.log(`Embeddings cargados: ${mentorEmbeddings.size}`);
  } catch (err) {
    console.error('No se pudieron cargar embeddings:', err.message);
  }
})();

// Función para similitud coseno rápida
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Verificar sólo la API Key de OpenAI
console.log("Estado de API Key de OpenAI:", process.env.OPENAI_API_KEY ? "Configurada ✅" : "NO CONFIGURADA ❌");
if (process.env.OPENAI_API_KEY) {
  console.log(`API Key comienza con: ${process.env.OPENAI_API_KEY.substring(0, 5)}...`);
}

// Ruta de prueba
app.get('/api/test', (req, res) => {
  res.json({ message: 'Servidor funcionando correctamente' });
});

// Función para evaluar un mentor con puntuación por componentes - versión optimizada
const evaluateMentor = async (mentor, mentee, requestId, modelName = "gpt-3.5-turbo") => {
  try {
    // Primero normalizar el mentor
    const normalizedMentor = {
      id: mentor.id || mentor.mentor_id || mentor.userId || `temp-${Date.now()}`,
      name: mentor.name || 
            (mentor.first_name && mentor.last_name ? `${mentor.first_name} ${mentor.last_name}` : null) || 
            mentor.full_name || 
            'Sin nombre',
      // Asegurarnos de que current_title tiene prioridad
      title: mentor.current_title || mentor.title || mentor.role || mentor.position || 'No especificado',
      company: mentor.company || mentor.current_company || mentor.organization || 'No especificada',
      bio: extractBio(mentor),
      // Añadir el current_title explícitamente
      current_title: mentor.current_title,
      is_available: mentor.is_available
    };

    if (DEBUG) {
      console.log(`
      ========= DEBUG MATCH [${requestId}] =========
      MENTEE BUSCA: "${mentee.lookingFor}"
      MENTOR BIO: "${normalizedMentor.bio}"
      =======================================
      `);
    }
    
    // VERIFICACIÓN DE COINCIDENCIA EXACTA
    // Si el texto del mentee es idéntico al texto del mentor, asignar 100% directamente
    const menteeText = mentee.lookingFor?.trim().toLowerCase();
    const mentorText = normalizedMentor.bio?.trim().toLowerCase();
    
    if (menteeText && mentorText && menteeText === mentorText) {
      console.log(`✅ [${requestId}] COINCIDENCIA EXACTA DETECTADA - ASIGNANDO 100%`);
      
      return {
        mentor: normalizedMentor,
        score: 100,
        explanation: "Coincidencia exacta: El texto del mentee es idéntico al del mentor."
      };
    }
    
    // Si no hay coincidencia exacta, continuar con la evaluación normal
    const compatibilityResponse = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { 
          role: "system", 
          content: `Eres un evaluador EXTREMADAMENTE EXIGENTE de compatibilidad entre mentores y mentees.

CRITERIO PRIMARIO:
- Si el TÍTULO o CARGO del mentor contiene las PALABRAS CLAVE que busca el mentee → AUTOMÁTICAMENTE puntuación BASE DE 80-90
- Si la BIO del mentor contiene EXPERIENCIA DIRECTA en lo que busca el mentee → AUTOMÁTICAMENTE puntuación BASE DE 70-80

SISTEMA DE PUNTUACIÓN:
1. PALABRAS CLAVE CRÍTICAS:
   - Identifica 1-3 PALABRAS CLAVE CRÍTICAS en la búsqueda del mentee
   - Si estas aparecen en el CARGO o TÍTULO del mentor → +30 puntos
   - Si estas aparecen en la BIO del mentor de manera prominente → +20 puntos
   - EJEMPLO: Mentee busca "comunicación" y mentor es "Head of Communications" → ALTA COINCIDENCIA

2. ANÁLISIS DE EXPERIENCIA DIRECTA:
   - Si el mentor tiene experiencia DIRECTA y ESPECÍFICA → +40 puntos
   - Si el mentor solo tiene habilidades transferibles → máximo 50 puntos totales

3. PENALIZACIONES OBLIGATORIAS:
   - Si el TÍTULO no contiene ninguna palabra clave relacionada → -20 puntos
   - Si la BIO no menciona experiencia directa → -30 puntos

REGLAS ABSOLUTAS:
1. CARGO "COMMUNICATIONS" para mentee buscando "communicator" → MÍNIMO 80 puntos
2. EXPERIENCIA DIRECTA en la habilidad solicitada → MÍNIMO 70 puntos
3. NUNCA más de 40 puntos si no hay experiencia directa visible
4. Si la BIO menciona ESPECÍFICAMENTE la habilidad buscada → +30 puntos

Responde con un JSON con este formato exacto:
{
  "palabras_clave": ["palabras clave identificadas"],
  "coincidencia_titulo": "alta/media/baja",
  "coincidencia_bio": "alta/media/baja",
  "puntuacion_final": n,
  "analisis": "Explicación detallada que DEBE mencionar si las palabras clave aparecen en el título y bio"
}`
        },
        { 
          role: "user", 
          content: `Evalúa con MÁXIMA PRECISIÓN la compatibilidad entre este mentor y mentee:

NECESIDAD DEL MENTEE:
"${mentee.lookingFor}"

PERFIL DEL MENTOR:
TÍTULO/CARGO: "${normalizedMentor.title}"
EMPRESA: "${normalizedMentor.company}"
BIO COMPLETA: "${normalizedMentor.bio}"

REGLA CRÍTICA DE EVALUACIÓN:
- Si el TÍTULO del mentor contiene las PALABRAS CLAVE que busca el mentee → DEBE tener alta puntuación
- EJEMPLO: Mentee busca "communication" y mentor es "Head of Communications" → MÍNIMO 80 puntos
- EJEMPLO: Mentee busca "leadership" y mentor menciona "leadership" en su bio → MÍNIMO 70 puntos

Evalúa primero el TÍTULO/CARGO, luego la BIO, y determina la relevancia DIRECTA.
No sobrevalores habilidades transferibles o generales.
Responde con el JSON requerido.`
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    // Analizar la respuesta JSON
    const result = JSON.parse(compatibilityResponse.choices[0].message.content);
    const score = result.puntuacion_final;
    
    // Añadir explicación a resultados
    return {
      mentor: normalizedMentor,
      score: result.puntuacion_final,
      explanation: result.analisis
    };
  } catch (error) {
    console.error(`Error evaluando mentor ${mentor.name}:`, error);
    throw error;
  }
};

// Función auxiliar para extraer bio de manera eficiente
function extractBio(mentor) {
  // Diagnóstico completo de todos los campos para identificar el problema
  if (DEBUG) {
    console.log(`[DIAGNÓSTICO COMPLETO]`, JSON.stringify(mentor));
  }
  
  if (typeof mentor.bio === 'string') return mentor.bio;
  if (mentor.description) return mentor.description;
  if (mentor.about) return mentor.about;
  if (mentor.biografía) return mentor.biografía;
  if (mentor.biometrics?.bio) return mentor.biometrics.bio;
  return 'No disponible';
}

// Implementación sencilla de limitador de concurrencia sin p-limit
function createLimiter(maxConcurrent) {
  let running = 0;
  const queue = [];

  const runTask = () => {
    if (running >= maxConcurrent || queue.length === 0) return;
    
    const { task, resolve, reject } = queue.shift();
    running++;
    
    Promise.resolve(task())
      .then(resolve)
      .catch(reject)
      .finally(() => {
        running--;
        runTask();
      });
  };

  return (task) => {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      runTask();
    });
  };
}

// Sistema optimizado de procesamiento de mentores
app.post('/api/match', async (req, res) => {
  try {
    const requestId = uuidv4().slice(0, 8);
    const { mentee, mentors: incomingMentors, model } = req.body;
    const modelName = model || "gpt-3.5-turbo";
    
    let mentors = incomingMentors;

    if (!mentee) {
      return res.status(400).json({ error: 'Falta información del mentee' });
    }

    // cargar mentores si no llegaron (opción móvil)
    if ((!mentors || mentors.length === 0) && supabase) {
      const { data, error } = await supabase
        .from('mentors')
        .select('id, first_name, last_name, description, is_available');
      if (error) {
        console.error('Error cargando mentores desde Supabase:', error.message);
        return res.status(500).json({ error: 'No se pudieron obtener mentores' });
      }
      mentors = data;
    }

    if (!mentors || !Array.isArray(mentors) || mentors.length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron mentores' });
    }
    
    // Conservar todos los datos originales sin modificarlos
    console.log("[DATOS ORIGINALES RECIBIDOS]:", mentors[0]);
    
    let mentorsToProcess = mentors;

    // ================= EMBEDDING FILTRADO =================
    console.log(`[${requestId}] Iniciando filtrado por embeddings…`);
    console.log('  mentee.lookingFor:', mentee.lookingFor);
    console.log('  embeddings disponibles:', mentorEmbeddings.size);

    if (mentorEmbeddings.size > 0 && mentee.lookingFor) {
      try {
        const embedResp = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: mentee.lookingFor
        });
        const menteeVector = embedResp.data[0].embedding;

        const scored = mentors.map((mentor) => {
          const id = mentor.id || mentor.mentor_id || mentor.userId;
          const vec = mentorEmbeddings.get(id);
          const sim = vec ? cosineSimilarity(menteeVector, vec) : -1;
          return { mentor, sim };
        });

        scored.sort((a, b) => b.sim - a.sim);
        mentorsToProcess = scored.slice(0, 200).map((s) => s.mentor);
        console.log(`[${requestId}] Embedding mentee generado OK`);
        console.log(`[${requestId}] Filtrado embeddings: ${mentorsToProcess.length}/${mentors.length}`);
      } catch (embErr) {
        console.error(`[${requestId}] Error durante filtrado por embeddings:`, embErr);
      }
    }

    const batchSize = mentorsToProcess.length;
    const startTime = Date.now();
    
    console.log(`⏱️ [${requestId}] Iniciando procesamiento para ${mentee.name}: ${batchSize} mentores`);
    
    // Resultados y progreso
    const results = new Array(batchSize).fill(null);
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    
    // Esperar a que p-limit esté disponible
    if (!pLimit) {
      console.log('Esperando a que p-limit esté disponible...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!pLimit) {
        console.log('Inicializando respaldo para p-limit');
        pLimit = (concurrency) => {
          const queue = [];
          let activeCount = 0;
        
          const next = () => {
            activeCount--;
            if (queue.length > 0) {
              queue.shift()();
            }
          };
        
          return (fn) => {
            return (...args) => {
              return new Promise((resolve, reject) => {
                const run = async () => {
                  activeCount++;
                  try {
                    const result = await fn(...args);
                    resolve(result);
                  } catch (error) {
                    reject(error);
                  }
                  next();
                };
        
                if (activeCount < concurrency) {
                  run();
                } else {
                  queue.push(run);
                }
              });
            };
          };
        };
      }
    }
    
    // Controlador de concurrencia
    const limit = createLimiter(25);
    
    // Función para enviar progreso en tiempo real (optional SSE implementation)
    const sendProgress = (count, total, success, errors) => {
      console.log(`⌛ [${requestId}] Progreso: ${count}/${total} (${success} éxitos, ${errors} errores)`);
    };
    
    // Procesar mentores de forma concurrente con gestión avanzada
    const processingPromises = mentorsToProcess.map((mentor, index) => 
      limit(async () => {
        const mentorId = mentor.id || mentor.mentor_id || index;
        const mentorName = mentor.name || mentor.first_name || `Mentor #${index+1}`;
        const startMentorTime = Date.now();
        
        try {
          // Procesar mentor individualmente
          if (DEBUG) {
            console.log("[ESTRUCTURA COMPLETA]", JSON.stringify(mentor, null, 2));
          }
          const result = await evaluateMentor(mentor, mentee, requestId, modelName);
          
          // Actualizar resultados y estadísticas
          results[index] = result;
          processed++;
          succeeded++;
          
          // Registrar tiempo y enviar progreso
          const mentorTime = ((Date.now() - startMentorTime) / 1000).toFixed(2);
          console.log(`✅ [${requestId}] Mentor #${index+1} (${result.mentor.name}) procesado en ${mentorTime}s`);
          
          if (processed % 5 === 0 || processed === batchSize) {
            sendProgress(processed, batchSize, succeeded, failed);
          }
          
          return result;
        } catch (error) {
          // Gestión sofisticada de errores corregida
          const errorMsg = error.message || 'Error desconocido';
          console.error(`❌ [${requestId}] Error en mentor #${index+1} (${mentorName}): ${errorMsg}`);
          
          processed++;
          failed++;
          sendProgress(processed, batchSize, succeeded, failed);
          
          return null;
        }
      })
    );
    
    // Esperar a que se completen todas las tareas (con gestión de errores)
    await Promise.all(processingPromises).catch(err => {
      console.error(`❌ [${requestId}] Error crítico durante el procesamiento: ${err.message}`);
    });
    
    // Filtrar resultados válidos y ordenarlos
    const validMatches = results.filter(result => result !== null);
    const matches = validMatches.sort((a, b) => b.score - a.score);
    
    // Estadísticas finales
    const processingTime = (Date.now() - startTime) / 1000;
    const avgTimePerMentor = processingTime / batchSize;
    
    console.log(`
    ====== RESUMEN [${requestId}] ======
    ✓ Tiempo total: ${processingTime.toFixed(2)} segundos
    ✓ Tiempo promedio por mentor: ${avgTimePerMentor.toFixed(2)} segundos
    ✓ Mentores procesados: ${processed}/${batchSize}
    ✓ Éxitos: ${succeeded} | Errores: ${failed}
    ✓ Matches encontrados: ${matches.length}
    =============================
    `);
    
    const responsePayload = {
      matches,
      stats: {
        totalProcessed: processed,
        succeeded,
        failed,
        totalTime: processingTime.toFixed(2),
        avgTimePerMentor: avgTimePerMentor.toFixed(2)
      },
      selectedMentorIds: mentorsToProcess.map(m => m.id || m.mentor_id || m.userId)
    };
    res.json(responsePayload);
    
  } catch (error) {
    console.error('❌ Error global en procesamiento:', error);
    res.status(500).json({
      error: 'Error interno al procesar matching: ' + error.message,
      message: 'Ha ocurrido un error crítico durante el procesamiento'
    });
  }
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`
  ===========================================
  🚀 Servidor iniciado correctamente
  📡 Escuchando en: http://localhost:${port}
  🔑 API Key OpenAI: ${process.env.OPENAI_API_KEY ? "Configurada ✅" : "NO CONFIGURADA ❌"}
  ===========================================
  `);
});

// Configuración CORS explícita
app.use(cors());
app.options('*', cors()); // Habilitar pre-flight para todas las rutas

// Middleware adicional para asegurar que los encabezados CORS se establecen
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://mentor-matching-app.netlify.app');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Silenciar logs en producción para evitar ruido en la consola del navegador
if (process.env.NODE_ENV !== 'development') {
  console.log = () => {};
}