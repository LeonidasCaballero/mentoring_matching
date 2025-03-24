require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Inicializar cliente Supabase
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

// Importar datos de ubicaciones
async function importLocations() {
  try {
    // Leer el archivo de SQL generado
    const locationsSQL = fs.readFileSync('locations_inserts.sql', 'utf8');
    const locationLines = locationsSQL.split('\n');
    
    const locations = locationLines.map(line => {
      // Extraer valores entre paréntesis: VALUES ('city', 'country', 'region')
      const valuesMatch = line.match(/VALUES \('([^']+)', '([^']+)', '([^']+)'\)/);
      if (valuesMatch) {
        return {
          city: valuesMatch[1],
          country: valuesMatch[2],
          region: valuesMatch[3]
        };
      }
      return null;
    }).filter(location => location !== null);
    
    // Mapa para almacenar IDs de ubicaciones por ciudad
    const locationIds = {};
    
    // Insertar ubicaciones
    for (const location of locations) {
      // Verificar si la ubicación ya existe
      const { data: existingLocation } = await supabase
        .from('locations')
        .select('location_id')
        .eq('city', location.city)
        .maybeSingle();
      
      if (existingLocation) {
        locationIds[location.city] = existingLocation.location_id;
        console.log(`Ubicación ${location.city} ya existe, ID: ${existingLocation.location_id}`);
      } else {
        // Insertar nueva ubicación
        const { data: newLocation, error } = await supabase
          .from('locations')
          .insert([location])
          .select()
          .single();
        
        if (error) {
          console.error(`Error al insertar ubicación ${location.city}:`, error);
          continue;
        }
        
        locationIds[location.city] = newLocation.location_id;
        console.log(`Ubicación ${location.city} insertada, ID: ${newLocation.location_id}`);
      }
    }
    
    // Guardar mapa de IDs para usar en importación de mentores
    fs.writeFileSync('location_ids.json', JSON.stringify(locationIds, null, 2));
    console.log('Importación de ubicaciones completada');
    return locationIds;
    
  } catch (error) {
    console.error('Error en importación de ubicaciones:', error);
    throw error;
  }
}

// Importar datos de mentores
async function importMentors(locationIds) {
  try {
    // Leer datos de mentores del JSON
    const mentorsData = JSON.parse(fs.readFileSync('mentors_data.json', 'utf8'));
    
    for (const mentor of mentorsData) {
      // Obtener ID de ubicación
      const locationId = locationIds[mentor.location] || null;
      
      // Preparar datos del mentor
      const mentorData = {
        first_name: mentor.firstName,
        last_name: mentor.lastName,
        current_title: mentor.title,
        bio: mentor.bio,
        location_id: locationId
      };
      
      // Insertar mentor
      const { data, error } = await supabase
        .from('mentors')
        .insert([mentorData])
        .select()
        .single();
      
      if (error) {
        console.error(`Error al insertar mentor ${mentor.firstName} ${mentor.lastName}:`, error);
        continue;
      }
      
      console.log(`Mentor ${mentor.firstName} ${mentor.lastName} insertado, ID: ${data.mentor_id}`);
    }
    
    console.log('Importación de mentores completada');
    
  } catch (error) {
    console.error('Error en importación de mentores:', error);
  }
}

// Ejecutar importación
async function runImport() {
  try {
    const locationIds = await importLocations();
    await importMentors(locationIds);
    console.log('Proceso de importación finalizado con éxito');
  } catch (error) {
    console.error('Error en proceso de importación:', error);
  }
}

runImport(); 