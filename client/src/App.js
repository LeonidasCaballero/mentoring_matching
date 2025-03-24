import React, { useState, useEffect } from 'react';
import './App.css';
import { createClient } from '@supabase/supabase-js';

// Variables de Supabase (para desarrollo solamente)
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "https://chbnzgqeuvfbhsbupuin.supabase.co";
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoYm56Z3FldXZmYmhzYnVwdWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI4MTAzODAsImV4cCI6MjA1ODM4NjM4MH0.OCNQQ53wO_za2oJTKPl5TYWZWIhnSnZx4qE-t42cZV4";

// Verificar si las variables están definidas
console.log("Supabase URL:", supabaseUrl);
console.log("Supabase Key:", supabaseAnonKey ? "Definida (oculta)" : "No definida");

// Crear cliente solo si las credenciales están disponibles
const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Datos de ejemplo para fallback si no hay conexión a Supabase
const FALLBACK_MENTORS = [
  {
    id: 1,
    name: "John Doe",
    title: "Senior Software Engineer",
    company: "Google",
    bio: "10+ años de experiencia en desarrollo web y mobile. Especializado en React y Node.js."
  },
  {
    id: 2,
    name: "Jane Smith",
    title: "Product Manager",
    company: "Microsoft",
    bio: "Experiencia liderando equipos de producto en tech. Especializada en desarrollo de producto y UX."
  },
  {
    id: 3,
    name: "Carlos Rodríguez",
    title: "Data Scientist",
    company: "Amazon",
    bio: "Especialista en machine learning y análisis de datos. 8 años de experiencia trabajando con modelos predictivos."
  },
  {
    id: 4,
    name: "María González",
    title: "UX/UI Designer",
    company: "Apple",
    bio: "Diseñadora de experiencias de usuario con enfoque en accesibilidad e inclusión. Experiencia en productos móviles y web."
  },
  {
    id: 5,
    name: "Ahmed Hassan",
    title: "CTO",
    company: "FinTech Startup",
    bio: "Emprendedor serial con 3 startups exitosas. Especializado en fintech, blockchain y sistemas de pago."
  }
];

// Función para normalizar los datos de mentores
const normalizeMentorData = (mentor) => {
  // Extraer campos principales primero para depurar
  console.log("Normalizando mentor con datos crudos:", mentor);
  
  // Intentar encontrar el nombre en varias propiedades posibles
  let name = mentor.name || mentor.nombre || mentor.full_name || mentor.fullName;
  // Si no hay nombre directo, intentar construirlo de nombres parciales
  if (!name) {
    const firstName = mentor.first_name || mentor.firstName || mentor.firstname || '';
    const lastName = mentor.last_name || mentor.lastName || mentor.lastname || '';
    name = (firstName + ' ' + lastName).trim() || 'Sin nombre';
  }
  
  // Para biometrics, puede que necesitemos acceder a una propiedad de objeto anidada
  let bio = '';
  if (typeof mentor.bio === 'string') {
    bio = mentor.bio;
  } else if (mentor.description) {
    bio = mentor.description;
  } else if (mentor.about) {
    bio = mentor.about;
  } else if (mentor.biografía) {
    bio = mentor.biografía;
  } else if (mentor.biometrics && typeof mentor.biometrics === 'object') {
    // Si 'biometrics' es un objeto, podría contener la bio como propiedad
    bio = mentor.biometrics.bio || mentor.biometrics.description || '';
  } else {
    bio = 'No disponible';
  }
  
  // CAMBIO CRUCIAL: Preservar current_title como title
  const title = mentor.current_title || mentor.title || mentor.role || mentor.position || mentor.cargo || mentor.puesto || 'No especificado';
  
  return {
    id: mentor.id || mentor.mentor_id || mentor.userId || Date.now() + Math.random(),
    name: name,
    title: title, // Ahora usamos la variable que extrae primero current_title
    company: mentor.company || mentor.organization || mentor.empresa || mentor.organizacion || 'No especificada',
    bio: bio,
    // Preservar current_title para que el servidor también lo tenga disponible
    current_title: mentor.current_title
  };
};

function App() {
  const [menteeInfo, setMenteeInfo] = useState({
    name: '',
    lookingFor: ''
  });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [mentors, setMentors] = useState([]);
  const [supabaseStatus, setSupabaseStatus] = useState('Verificando...');
  // eslint-disable-next-line no-unused-vars
  const [availableMentors, setAvailableMentors] = useState([]);
  const MENTORS_PER_PAGE = 15;
  const [progress, setProgress] = useState({ 
    current: 0, 
    total: 0,
    processed: 0
  });

  // Verificar conexión a Supabase al cargar
  useEffect(() => {
    async function checkSupabase() {
      if (!supabase) {
        setSupabaseStatus('No configurado - usando datos de ejemplo');
        return;
      }
      
      try {
        setSupabaseStatus('Conectando...');
        const { data: supabaseMentors, error: fetchError } = await supabase.from('mentors').select('*');
        
        if (fetchError) {
          console.error('Error Supabase:', fetchError);
          setSupabaseStatus(`Error: ${fetchError.message} - usando datos de ejemplo`);
        } else {
          setSupabaseStatus(`Conectado ✅ (${supabaseMentors.length} mentores disponibles)`);
        }
      } catch (err) {
        console.error('Error al conectar con Supabase:', err);
        setSupabaseStatus(`Error de conexión: ${err.message} - usando datos de ejemplo`);
      }
    }
    
    checkSupabase();
  }, []);

  const processMentorsSequentially = async (allMentors) => {
    const BATCH_SIZE = 15;
    let processedResults = [];
    
    try {
      for (let i = 0; i < allMentors.length; i += BATCH_SIZE) {
        const currentBatch = allMentors.slice(i, i + BATCH_SIZE);
        
        // Actualizar progreso al inicio de cada lote
        setProgress({
          current: Math.floor(i / BATCH_SIZE) + 1,
          total: allMentors.length,
          processed: processedResults.length
        });
        
        // Imprimir explícitamente los datos que se están enviando
        console.log("Enviando al servidor batch con primer mentor:", 
                    JSON.stringify(currentBatch[0]));
        
        const response = await fetch('http://localhost:5002/api/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mentee: menteeInfo,
            // Enviar los datos sin normalizar para preservar todos los campos originales
            mentors: currentBatch 
          }),
        });
        
        if (!response.ok) throw new Error(response.statusText);
        
        const data = await response.json();
        
        // Solución segura para el error no-loop-func
        // eslint-disable-next-line no-loop-func
        processedResults = [...processedResults, ...data.matches].sort((a, b) => b.score - a.score);
        
        // Actualizar resultados ordenados
        setResults(processedResults);
        
        // Actualizar progreso después de procesar cada lote
        setProgress(prev => ({
          ...prev,
          processed: processedResults.length
        }));
        
        console.log(`Lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allMentors.length / BATCH_SIZE)} completado, total matches: ${processedResults.length}`);
      }
      
      // Ordenación final para asegurar que todo esté en orden correcto
      const sortedResults = [...processedResults].sort((a, b) => b.score - a.score);
      setResults(sortedResults);
      
      return sortedResults;
    } catch (error) {
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!menteeInfo.name || !menteeInfo.lookingFor) {
      setError('Por favor completa todos los campos');
      return;
    }
    
    setLoading(true);
    setError(null);
    setResults([]);
    setProgress({ 
      current: 0, 
      total: 0,
      processed: 0
    });

    try {
      let allMentors = [];
      
      if (!supabase) {
        console.log("Usando mentores de ejemplo");
        allMentors = FALLBACK_MENTORS;
      } else {
        // Obtener mentores de Supabase
        const { data: supabaseMentors, error: fetchError } = await supabase.from('mentors').select('*');
        
        if (fetchError) {
          throw new Error('Error cargando mentores: ' + fetchError.message);
        }
        
        if (!supabaseMentors || supabaseMentors.length === 0) {
          setError('No se encontraron mentores en la base de datos');
          setLoading(false);
          return;
        }
        
        // IMPORTANTE: Enviar los datos originales sin normalizar
        allMentors = supabaseMentors;
        console.log("Primeros 3 mentores de Supabase:", 
                    supabaseMentors.slice(0, 3).map(m => ({
                      mentor_id: m.mentor_id, 
                      first_name: m.first_name,
                      current_title: m.current_title
                    })));
      }
      
      console.log(`Total de ${allMentors.length} mentores disponibles`);
      
      // Usar la nueva función que procesa todos los mentores en secuencia
      await processMentorsSequentially(allMentors);
      setLoading(false);
    } catch (err) {
      console.error('Error durante el matching:', err);
      setError('Error: ' + err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (results.length > 0) {
      console.log("Primer mentor recibido:", results[0].mentor);
    }
  }, [results]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Mentoring Matcher</h1>
        <div className="supabase-status">
          {supabaseStatus}
        </div>
      </header>
      
      <main>
        <div className="form-container">
          <h2>Encuentra tu mentor ideal</h2>
          
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name">Tu nombre:</label>
              <input
                id="name"
                type="text"
                value={menteeInfo.name}
                onChange={(e) => setMenteeInfo({...menteeInfo, name: e.target.value})}
                placeholder="Ingresa tu nombre completo"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="lookingFor">¿Qué buscas en el programa de mentoring?</label>
              <textarea
                id="lookingFor"
                value={menteeInfo.lookingFor}
                onChange={(e) => setMenteeInfo({...menteeInfo, lookingFor: e.target.value})}
                placeholder="Describe tus objetivos, intereses y qué esperas de un mentor..."
              />
            </div>
            
            <button type="submit" disabled={loading}>
              {loading ? 'Buscando mentores...' : 'Encontrar Mentores'}
            </button>
          </form>
          
          {error && <div className="error">{error}</div>}
        </div>
        
        {loading && (
          <div className="loading">
            <p>Evaluando compatibilidad con mentores...</p>
            {progress.total > 0 && (
              <>
                <div className="progress-container">
                  <div 
                    className="progress-bar" 
                    style={{
                      width: `${Math.min(Math.round((progress.processed / progress.total) * 100), 100)}%`
                    }}
                  >
                    <span className="progress-text">
                      {Math.min(Math.round((progress.processed / progress.total) * 100), 100)}%
                    </span>
                  </div>
                </div>
                <p className="progress-stats">
                  Mentores procesados: {progress.processed} de {progress.total}
                  <br />
                  {progress.processed < progress.total ? 'Procesando...' : 'Completado'}
                </p>
              </>
            )}
          </div>
        )}
        
        {results.length > 0 && (
          <div className="results-container">
            <h2>Tus mejores matches ({results.length})</h2>
            <div className="results">
              {results.map((match, index) => (
                <div key={index} className="match-card">
                  {/* Score general */}
                  <div className="match-score">{match.score}%</div>
                  
                  {/* Información básica */}
                  <h3>{match.mentor.name}</h3>
                  <p className="mentor-title">{match.mentor.title}</p>
                  
                  {/* Bio */}
                  <div className="mentor-bio">
                    <p>{match.mentor.bio}</p>
                  </div>
                  
                  {/* Componentes de puntuación */}
                  {match.components && (
                    <div className="score-components">
                      <div className="component">
                        <span className="component-name">Relevancia temática:</span>
                        <div className="component-bar">
                          <div className="component-fill" style={{width: `${match.components.relevance * 2}%`}}></div>
                        </div>
                        <span className="component-value">{match.components.relevance}/50</span>
                      </div>
                      <div className="component">
                        <span className="component-name">Experiencia:</span>
                        <div className="component-bar">
                          <div className="component-fill" style={{width: `${match.components.experience * 3.33}%`}}></div>
                        </div>
                        <span className="component-value">{match.components.experience}/30</span>
                      </div>
                      <div className="component">
                        <span className="component-name">Enfoque de mentoría:</span>
                        <div className="component-bar">
                          <div className="component-fill" style={{width: `${match.components.approach * 5}%`}}></div>
                        </div>
                        <span className="component-value">{match.components.approach}/20</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App; 