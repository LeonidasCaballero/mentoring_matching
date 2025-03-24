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
  
  return {
    id: mentor.id || mentor.mentor_id || mentor.userId || Date.now() + Math.random(),
    name: name,
    title: mentor.title || mentor.role || mentor.position || mentor.cargo || mentor.puesto || 'No especificado',
    company: mentor.company || mentor.organization || mentor.empresa || mentor.organizacion || 'No especificada',
    bio: bio
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
  const [mentors, setMentors] = useState([]);
  const [supabaseStatus, setSupabaseStatus] = useState('Verificando...');
  const [useDemo, setUseDemo] = useState(!supabase);
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
        setUseDemo(true);
        return;
      }
      
      try {
        setSupabaseStatus('Conectando...');
        const { data: supabaseMentors, error: fetchError } = await supabase.from('mentors').select('*');
        
        if (fetchError) {
          console.error('Error Supabase:', fetchError);
          setSupabaseStatus(`Error: ${fetchError.message} - usando datos de ejemplo`);
          setUseDemo(true);
        } else {
          setSupabaseStatus(`Conectado ✅ (${supabaseMentors.length} mentores disponibles)`);
          setUseDemo(false);
        }
      } catch (err) {
        console.error('Error al conectar con Supabase:', err);
        setSupabaseStatus(`Error de conexión: ${err.message} - usando datos de ejemplo`);
        setUseDemo(true);
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
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(allMentors.length / BATCH_SIZE);
        
        console.log(`Procesando lote ${batchNumber}/${totalBatches} (${currentBatch.length} mentores)`);
        
        // Actualizar progreso antes de comenzar el procesamiento
        setProgress({
          current: batchNumber,
          total: allMentors.length,
          processed: processedResults.length
        });
        
        const response = await fetch('http://localhost:5002/api/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mentee: menteeInfo,
            mentors: currentBatch
          }),
        });
        
        if (!response.ok) throw new Error(response.statusText);
        
        const data = await response.json();
        // Combinar resultados anteriores con nuevos resultados
        processedResults = [...processedResults, ...data.matches];
        
        // Ordenar todos los resultados acumulados por puntuación (de mayor a menor)
        processedResults.sort((a, b) => b.score - a.score);
        
        // Actualizar resultados ordenados
        setResults([...processedResults]);
        setProgress(prev => ({
          ...prev,
          processed: processedResults.length
        }));
        
        console.log(`Lote ${batchNumber}/${totalBatches} completado, total matches: ${processedResults.length}`);
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

    try {
      let allMentors = [];
      
      if (useDemo) {
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
        
        // Normalizar todos los mentores
        allMentors = supabaseMentors.map(normalizeMentorData);
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

  const toggleDataSource = () => {
    setUseDemo(!useDemo);
    setResults([]);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Mentoring Matcher</h1>
        <div className="supabase-status">
          {supabaseStatus}
          {supabase && (
            <button className="toggle-btn" onClick={toggleDataSource}>
              {useDemo ? 'Usar datos reales' : 'Usar datos de ejemplo'}
            </button>
          )}
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
              <p>
                Progreso: Lote {progress.current} de {Math.ceil(progress.total / MENTORS_PER_PAGE)} 
                ({Math.round((progress.current * MENTORS_PER_PAGE / progress.total) * 100)}%)
                <br/>
                Mentores procesados: {progress.processed}
              </p>
            )}
          </div>
        )}
        
        {results.length > 0 && (
          <div className="results-container">
            <h2>Tus mejores matches ({results.length})</h2>
            <div className="results">
              {results.map((match, index) => (
                <div key={index} className="match-card">
                  <div className="match-score">{match.score}% compatible</div>
                  <h3>{match.mentor.name}</h3>
                  <p className="mentor-title">{match.mentor.title}</p>
                  {match.mentor.company && (
                    <p className="mentor-company">{match.mentor.company}</p>
                  )}
                  <div className="match-reason">
                    <h4>¿Por qué es un buen match?</h4>
                    <p>{match.reason}</p>
                  </div>
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