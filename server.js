const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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
const evaluateMentor = async (mentor, mentee, requestId) => {
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
      current_title: mentor.current_title
    };

    // Debug log
    console.log(`
    ========= DEBUG MATCH [${requestId}] =========
    MENTEE BUSCA: "${mentee.lookingFor}"
    MENTOR BIO: "${normalizedMentor.bio}"
    =======================================
    `);
    
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
      model: "gpt-3.5-turbo",
      messages: [
        { 
          role: "system", 
          content: `Eres un experto en matching de competencias entre mentores y mentees.

ANÁLISIS DETALLADO DE NECESIDADES:
1. Identifica ESPECÍFICAMENTE lo que busca el mentee (industrias, habilidades, experiencias concretas)
2. Evalúa CADA UNO de esos elementos en el perfil del mentor
3. Asigna puntuación basada en CUÁNTOS elementos específicos coinciden

PONDERACIÓN DE CRITERIOS (muy importante):
- Las coincidencias en áreas específicas (industrias, roles) tienen MÁS PESO que habilidades generales
- Experiencia DIRECTA en lo que busca el mentee vale más que habilidades transferibles
- Experiencia ESPECÍFICA en industrias mencionadas vale más que experiencia general

RANGOS DE PUNTUACIÓN ESTRICTOS:
80-100: ALTA coincidencia en áreas ESPECÍFICAS (industrias, experiencia concreta solicitada)
60-79: Coincidencia MODERADA (algunas áreas específicas, otras transferibles)
40-59: Coincidencia PARCIAL (principalmente habilidades transferibles)
20-39: Coincidencia BAJA (pocas habilidades transferibles)
0-19: Sin coincidencia relevante

Responde con un JSON con este formato exacto:
{
  "puntuacion": (0-100),
  "coincidencias_especificas": ["lista de coincidencias específicas"],
  "coincidencias_transferibles": ["lista de habilidades transferibles"],
  "elementos_no_cubiertos": ["elementos importantes que el mentor no cubre"],
  "razon": "Explicación detallada de la puntuación"
}`
        },
        { 
          role: "user", 
          content: `Evalúa la compatibilidad entre este mentor y mentee:

NECESIDAD DEL MENTEE (texto exacto):
${mentee.lookingFor}

PERFIL DEL MENTOR (texto exacto):
Cargo: ${normalizedMentor.title}
Biografía: ${normalizedMentor.bio}

INSTRUCCIÓN CRÍTICA:
- PRIMERO compara si hay TEXTO IDÉNTICO entre lo que busca el mentee y la bio del mentor
- Si encuentras segmentos de texto idénticos o muy similares → ASIGNA 100%
- De lo contrario, realiza el análisis semántico normal

Responde con un JSON con este formato exacto:
{
  "puntuacion": (0-100),
  "razon": "Explicación detallada que justifique esta puntuación, mencionando EXPLÍCITAMENTE si detectaste coincidencia textual"
}`
        }
      ],
      temperature: 0.3, // Permitir más flexibilidad para análisis semántico
    });

    // Analizar la respuesta JSON
    const result = JSON.parse(compatibilityResponse.choices[0].message.content);
    const score = result.puntuacion;
    
    // Añadir explicación a resultados
    return {
      mentor: normalizedMentor,
      score: result.puntuacion,
      explanation: result.razon
    };
  } catch (error) {
    console.error(`Error evaluando mentor ${mentor.name}:`, error);
    throw error;
  }
};

// Función auxiliar para extraer bio de manera eficiente
function extractBio(mentor) {
  // Diagnóstico completo de todos los campos para identificar el problema
  console.log("[DIAGNÓSTICO COMPLETO]", JSON.stringify(mentor));
  
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
    const { mentee, mentors } = req.body;
    
    if (!mentee || !mentors || !Array.isArray(mentors)) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    // Conservar todos los datos originales sin modificarlos
    console.log("[DATOS ORIGINALES RECIBIDOS]:", mentors[0]);
    
    const mentorsToProcess = mentors;
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
          console.log("[ESTRUCTURA COMPLETA]", JSON.stringify(mentor, null, 2));
          const result = await evaluateMentor(mentor, mentee, requestId);
          
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
    
    res.json({
      matches,
      stats: {
        totalProcessed: processed,
        succeeded,
        failed,
        totalTime: processingTime.toFixed(2),
        avgTimePerMentor: avgTimePerMentor.toFixed(2)
      }
    });
    
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