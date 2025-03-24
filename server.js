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
const port = 5002;

// Middleware - aumentar límites de tamaño de solicitud
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? '*' 
    : `http://localhost:${process.env.REACT_APP_PORT || 3000}`
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

// Función optimizada para evaluar un mentor
async function evaluateMentor(mentee, mentor) {
  try {
    // Extraer información esencial de manera eficiente
    const mentorName = mentor.name || mentor.nombre || mentor.full_name || 'Sin nombre';
    const mentorTitle = mentor.title || mentor.role || mentor.position || 'No especificado';
    const mentorCompany = mentor.company || mentor.organization || 'No especificada';
    const mentorBio = extractBio(mentor);
    
    // Prompt simplificado (más corto = más rápido)
    const prompt = `
      MENTEE: ${mentee.name} busca: ${mentee.lookingFor}
      
      MENTOR: ${mentorName}, ${mentorTitle} en ${mentorCompany}. 
      Bio: ${mentorBio.slice(0, 500)}
      
      Evalúa la compatibilidad (0-100) entre este mentee y mentor basado en intereses, experiencia y habilidades. Responde en JSON: {"score": N, "reason": "explicación"}
    `;

    const completion = await openai.chat.completions.create({
      messages: [
        { role: "system", content: "Evaluador experto de compatibilidad mentor-mentee. Responde en JSON: {score, reason}" },
        { role: "user", content: prompt }
      ],
      model: "gpt-4-turbo",
      temperature: 0.5, // Reducido para mayor consistencia
      response_format: { type: "json_object" },
      max_tokens: 500 // Limitar tokens para mayor velocidad
    });

    const response = JSON.parse(completion.choices[0].message.content);
    
    return {
      mentor: {
        name: mentorName,
        title: mentorTitle,
        company: mentorCompany,
        id: mentor.id || ''
      },
      score: response.score,
      reason: response.reason
    };
  } catch (error) {
    console.error('Error evaluando mentor:', error);
    throw error; // Rethrow para gestión centralizada
  }
}

// Función auxiliar para extraer bio de manera eficiente
function extractBio(mentor) {
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
        const mentorId = mentor.id || index;
        const startMentorTime = Date.now();
        
        try {
          // Procesar mentor individualmente
          const result = await evaluateMentor(mentee, mentor);
          
          // Actualizar resultados y estadísticas
          results[index] = result;
          processed++;
          succeeded++;
          
          // Registrar tiempo y enviar progreso
          const mentorTime = ((Date.now() - startMentorTime) / 1000).toFixed(2);
          console.log(`✅ [${requestId}] Mentor #${index+1} (${mentor.name || 'Sin nombre'}) procesado en ${mentorTime}s`);
          
          if (processed % 5 === 0 || processed === batchSize) {
            sendProgress(processed, batchSize, succeeded, failed);
          }
          
          return result;
        } catch (error) {
          // Gestión sofisticada de errores
          const errorMsg = error.message || 'Error desconocido';
          console.error(`❌ [${requestId}] Error en mentor #${index+1} (${mentor.name || 'Sin nombre'}): ${errorMsg}`);
          
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