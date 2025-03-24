require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Inicializar cliente Supabase
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

// Datos de mentores que quieres importar
const mentorsData = [
  {
    first_name: 'Teresa',
    last_name: 'Echeverría',
    current_title: 'Head of Entrepreneur Growth & Experience at Endeavor',
    bio: 'A Manager with experience at Endeavor, Plug and Play Tech Center, and Google...',
    city: 'Madrid',
    country: 'Spain'
  },
  // Añade aquí más mentores...
];

// Función para procesar e insertar datos
async function importMentors() {
  try {
    for (const mentorData of mentorsData) {
      // Primero verificar si la ubicación existe o crearla
      let locationId;
      
      // Buscar ubicación
      const { data: locationData } = await supabase
        .from('locations')
        .select('location_id')
        .eq('city', mentorData.city)
        .eq('country', mentorData.country)
        .single();
      
      if (locationData) {
        locationId = locationData.location_id;
      } else {
        // Crear nueva ubicación
        const { data: newLocation, error: locationError } = await supabase
          .from('locations')
          .insert([
            { city: mentorData.city, country: mentorData.country, region: 'Europe' }
          ])
          .select()
          .single();
        
        if (locationError) throw locationError;
        locationId = newLocation.location_id;
      }
      
      // Insertar mentor
      const { error: mentorError } = await supabase
        .from('mentors')
        .insert([
          {
            first_name: mentorData.first_name,
            last_name: mentorData.last_name,
            current_title: mentorData.current_title,
            bio: mentorData.bio,
            location_id: locationId
          }
        ]);
      
      if (mentorError) throw mentorError;
      
      console.log(`Mentor ${mentorData.first_name} ${mentorData.last_name} insertado correctamente`);
    }
    
    console.log('Importación completada con éxito');
  } catch (error) {
    console.error('Error en la importación:', error);
  }
}

// Ejecutar la importación
importMentors(); 