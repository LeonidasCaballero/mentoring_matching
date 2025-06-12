import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import './ImportMentees.css';

// Variables de Supabase
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "https://chbnzgqeuvfbhsbupuin.supabase.co";
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoYm56Z3FldXZmYmhzYnVwdWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI4MTAzODAsImV4cCI6MjA1ODM4NjM4MH0.OCNQQ53wO_za2oJTKPl5TYWZWIhnSnZx4qE-t42cZV4";

// Crear cliente de Supabase
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const ImportMentees = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setError(null);
  };

  const parseCSV = (csvText) => {
    // Dividir por líneas
    const lines = csvText.split('\n');
    
    // La primera línea es la cabecera
    const headers = lines[0].split(',').map(header => 
      header.replace(/"/g, '').trim()
    );
    
    // Extraer los datos
    const mentees = [];
    for (let i = 1; i < lines.length; i++) {
      // Saltarse líneas vacías
      if (!lines[i].trim()) continue;
      
      // Dividir los campos, respetando comillas
      const fields = [];
      let field = '';
      let inQuotes = false;
      
      for (let j = 0; j < lines[i].length; j++) {
        const char = lines[i][j];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          fields.push(field);
          field = '';
        } else {
          field += char;
        }
      }
      // Añadir el último campo
      fields.push(field);
      
      // Crear objeto mentee
      const mentee = {};
      headers.forEach((header, index) => {
        // Limpiar comillas
        let value = fields[index] ? fields[index].replace(/"/g, '').trim() : null;
        
        // Establecer valores predeterminados para campos obligatorios
        if (value === null || value === '') {
          if (header === 'is_visible') {
            value = true; // Valor predeterminado si está vacío
          }
        } else {
          // Convertir tipos de datos
          if (header === 'id') {
            value = parseInt(value);
          } else if (header === 'is_visible') {
            value = value === '1' || value === 'true';
          }
        }
        
        mentee[header] = value;
      });
      
      mentees.push(mentee);
    }
    
    return mentees;
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Por favor, selecciona un archivo CSV');
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);
    
    try {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const csvText = e.target.result;
          const mentees = parseCSV(csvText);
          
          // Validar mentees
          const validMentees = mentees.filter(mentee => 
            mentee.id && 
            mentee.email && 
            mentee.first_name && 
            mentee.last_name
          );
          
          if (validMentees.length === 0) {
            throw new Error('No se encontraron datos válidos en el CSV');
          }
          
          // Logging de mentees rechazados
          const rejectedMentees = mentees.filter(mentee => 
            !(mentee.id && mentee.email && mentee.first_name && mentee.last_name)
          );
          
          console.log('Mentees rechazados:', rejectedMentees);
          console.log('Razones de rechazo:');
          rejectedMentees.forEach((mentee, index) => {
            const reasons = [];
            if (!mentee.id) reasons.push('ID faltante');
            if (!mentee.email) reasons.push('Email faltante');
            if (!mentee.first_name) reasons.push('Nombre faltante');
            if (!mentee.last_name) reasons.push('Apellido faltante');
            
            console.log(`Mentee #${index + 1} (linea ${mentees.indexOf(mentee) + 2}): ${reasons.join(', ')}`);
          });
          
          // Insertar a Supabase
          const { data, error } = await supabase
            .from('mentees')
            .upsert(validMentees, { 
              onConflict: 'id',
              ignoreDuplicates: false 
            });
            
          if (error) throw error;
          
          setResult({
            success: true,
            count: validMentees.length,
            total: mentees.length
          });
        } catch (err) {
          setError(err.message || 'Error al procesar el archivo');
        } finally {
          setUploading(false);
        }
      };
      
      reader.onerror = () => {
        setError('Error al leer el archivo');
        setUploading(false);
      };
      
      reader.readAsText(file);
      
    } catch (err) {
      setError(err.message || 'Error al subir el archivo');
      setUploading(false);
    }
  };

  return (
    <div className="import-mentees">
      <h2>Importar Mentees desde CSV</h2>
      
      <div className="upload-container">
        <input 
          type="file" 
          accept=".csv" 
          onChange={handleFileChange}
          disabled={uploading}
          id="csv-upload-mentees"
        />
        <label htmlFor="csv-upload-mentees" className={`file-label ${uploading ? 'disabled' : ''}`}>
          {file ? file.name : 'Seleccionar archivo CSV'}
        </label>
        
        <button 
          className="upload-button"
          onClick={handleUpload}
          disabled={!file || uploading}
        >
          {uploading ? 'Importando...' : 'Importar Mentees'}
        </button>
      </div>
      
      {error && (
        <div className="error-message">
          <p>Error: {error}</p>
        </div>
      )}
      
      {result && (
        <div className="success-message">
          <p>¡Importación exitosa!</p>
          <p>Se importaron {result.count} de {result.total} mentees.</p>
        </div>
      )}
    </div>
  );
};

export default ImportMentees; 