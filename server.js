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
    // Loguear datos originales para diagnóstico
    console.log(`[DEBUG] Datos originales del mentor:`, {
      id: mentor.id || mentor.mentor_id,
      name: mentor.name,
      first_name: mentor.first_name,
      last_name: mentor.last_name,
      title: mentor.title,
      current_title: mentor.current_title,
      company: mentor.company,
      bio: mentor.bio?.substring(0, 50) + '...'
    });
    
    // Asegurarnos que estamos normalizando los campos del mentor antes de usarlos
    const normalizedMentor = {
      id: mentor.id || mentor.mentor_id || mentor.userId || `temp-${Date.now()}`,
      name: mentor.name || 
            (mentor.first_name && mentor.last_name ? `${mentor.first_name} ${mentor.last_name}` : null) || 
            mentor.full_name || 
            'Sin nombre',
      title: mentor.current_title || mentor.title || mentor.role || mentor.position || mentor.cargo || mentor.puesto || 'No especificado',
      company: mentor.company || mentor.current_company || mentor.organization || mentor.empresa || 'No especificada',
      bio: extractBio(mentor)
    };
    
    // Loguear datos normalizados para diagnóstico
    console.log(`[DEBUG] Datos normalizados:`, normalizedMentor);
    
    // Sistema de prompt mejorado con criterios ESTRICTOS de relevancia temática
    const compatibilityResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { 
          role: "system", 
          content: `Eres un experto en matching de mentores y mentees con criterios MUY ESTRICTOS y CONOCIMIENTO DE LA INDUSTRIA.

1. RELEVANCIA TEMÁTICA (0-70 puntos): Sé EXTREMADAMENTE CRÍTICO y EXIGENTE.
   - TERMINOLOGÍA ESPECIALIZADA: Debes conocer términos específicos de la industria:
     * "MBB" = McKinsey, BCG y Bain (las principales consultoras)
     * "FAANG" = Facebook/Meta, Apple, Amazon, Netflix, Google
     * "IB" = Investment Banking
   
   - ANÁLISIS DE EXPERIENCIA REAL:
     * Si el mentee busca entrar a MBB y el mentor trabaja/trabajó en McKinsey, BCG o Bain = 60-70 puntos
     * Si el mentor menciona explícitamente ayudar con el proceso de selección para el tipo de empresa específico = 50-60 puntos
     * Si el mentor trabaja en la industria pero no en empresas específicas = 30-50 puntos
     * Mentores sin conexión directa con la industria buscada = 0-20 puntos

2. EXPERIENCIA GENERAL (0-20 puntos): Experiencia profesional verificable.

3. ENFOQUE DE MENTORÍA (0-10 puntos): Estilo y metodología de mentoría.

IMPORTANTE: Debes verificar PRIMERO si el mentor tiene experiencia DIRECTA en lo que busca el mentee. Los mentores que HAN TRABAJADO en las empresas donde el mentee quiere entrar deben recibir la MÁXIMA puntuación de relevancia.

Ejemplo: Si el mentee quiere "get a job in MBB" y el mentor trabajó en BCG = mínimo 65 puntos en relevancia.`
        },
        { 
          role: "user", 
          content: `Evalúa la compatibilidad entre este mentor y mentee usando el sistema de componentes:
          
          MENTOR:
          Nombre: ${normalizedMentor.name}
          Cargo: ${normalizedMentor.title}
          Empresa: ${normalizedMentor.company}
          Biografía: ${normalizedMentor.bio}
          
          MENTEE:
          Nombre: ${mentee.name}
          Busca: ${mentee.lookingFor}
          
          Responde con un JSON con este formato exacto:
          {
            "relevancia_tematica": (0-70),
            "experiencia_general": (0-20),
            "enfoque_mentoria": (0-10),
            "puntuacion_total": (suma de los tres componentes),
            "razon_puntuacion": "Breve explicación (1-2 frases) de por qué recibió esta puntuación"
          }`
        }
      ],
      temperature: 0.2, // Reducir temperatura para obtener respuestas más consistentes
      response_format: { type: "json_object" },
    });

    // Analizar la respuesta JSON
    const result = JSON.parse(compatibilityResponse.choices[0].message.content);
    const score = result.puntuacion_total;
    
    // Añadir explicación a resultados
    return {
      mentor: normalizedMentor,
      score,
      components: {
        relevance: result.relevancia_tematica,
        experience: result.experiencia_general,
        approach: result.enfoque_mentoria
      },
      explanation: result.razon_puntuacion
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