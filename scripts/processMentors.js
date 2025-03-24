const fs = require('fs');

// Leer el archivo de mentores
const mentorsText = fs.readFileSync('mentors.txt', 'utf8');

// Dividir por "Avatar" que es lo que separa cada mentor
const mentorsArray = mentorsText.split('Avatar\n');

// Preparar arrays para los datos procesados
const mentorsData = [];
const sqlInserts = [];
const locationsMap = new Map(); // Para evitar ubicaciones duplicadas

for (let mentorText of mentorsArray) {
  if (!mentorText.trim() || mentorText.includes('788 mentors')) continue;
  
  const lines = mentorText.split('\n').filter(line => line.trim());
  
  if (lines.length >= 3) {
    // Procesar nombre
    const name = lines[0].trim();
    const nameParts = name.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';
    
    // Procesar cargo y empresa
    const titleLine = lines[1].trim();
    let title = titleLine;
    let company = '';
    
    if (titleLine.includes(' at ')) {
      const titleParts = titleLine.split(' at ');
      title = titleParts[0].trim();
      company = titleParts[1].trim();
    }
    
    // Procesar ubicación
    const location = lines[2].trim();
    let city = location;
    let country = 'Unknown';
    
    // Extraer país si es posible
    if (!locationsMap.has(location)) {
      locationsMap.set(location, {
        city: location,
        country: 'Unknown',
        region: getRegion(location)
      });
    }
    
    // Procesar biografía
    let bio = '';
    if (lines.length > 3) {
      // Si hay comillas al inicio y final, las eliminamos
      bio = lines[3].trim();
      if (bio.startsWith('"') && bio.endsWith('"')) {
        bio = bio.substring(1, bio.length - 1);
      }
      // Escapar comillas simples
      bio = bio.replace(/'/g, "''");
    }
    
    // Crear objeto de datos
    const mentorData = {
      firstName,
      lastName,
      title,
      company,
      location,
      bio
    };
    
    mentorsData.push(mentorData);
    
    // Crear sentencia SQL (con manejo de comillas)
    const insertSql = `INSERT INTO mentors (first_name, last_name, current_title, bio) 
      VALUES ('${firstName.replace(/'/g, "''")}', '${lastName.replace(/'/g, "''")}', '${title.replace(/'/g, "''")}', '${bio}');`;
    
    sqlInserts.push(insertSql);
  }
}

// Función para determinar la región basada en la ubicación
function getRegion(location) {
  const europeanCities = ['Madrid', 'Barcelona', 'Milan', 'Paris', 'London', 'Zurich', 'Amsterdam', 'Stockholm', 'Copenhagen'];
  const usaCities = ['New York', 'San Francisco', 'Miami', 'Chicago'];
  
  if (europeanCities.some(city => location.includes(city))) {
    return 'Europe';
  } else if (usaCities.some(city => location.includes(city))) {
    return 'North America';
  } else if (location.includes('Dubai')) {
    return 'Middle East';
  }
  
  return 'Unknown';
}

// Generar SQL para ubicaciones
const locationInserts = Array.from(locationsMap.values()).map(loc => 
  `INSERT INTO locations (city, country, region) VALUES ('${loc.city.replace(/'/g, "''")}', '${loc.country}', '${loc.region}');`
);

// Escribir los resultados
fs.writeFileSync('mentors_data.json', JSON.stringify(mentorsData, null, 2));
fs.writeFileSync('locations_inserts.sql', locationInserts.join('\n'));
fs.writeFileSync('mentors_inserts.sql', sqlInserts.join('\n'));

console.log(`Se han procesado ${mentorsData.length} mentores`);
console.log(`Generados ${locationInserts.length} inserts de ubicaciones`);
console.log(`Generados ${sqlInserts.length} inserts de mentores`); 