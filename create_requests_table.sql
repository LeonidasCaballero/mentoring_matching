-- Tabla para guardar las peticiones de matching de usuarios
CREATE TABLE user_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id VARCHAR(8) NOT NULL, -- ID temporal del request
  mentee_name VARCHAR(255),
  mentee_looking_for TEXT NOT NULL,
  total_mentors_processed INTEGER,
  matches_found INTEGER,
  processing_time_seconds DECIMAL(10,2),
  model_used VARCHAR(50) DEFAULT 'gpt-3.5-turbo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Índices para consultas comunes
  INDEX idx_created_at (created_at),
  INDEX idx_request_id (request_id)
);

-- Tabla para guardar los matches individuales (opcional, para análisis detallado)
CREATE TABLE user_matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES user_requests(id) ON DELETE CASCADE,
  mentor_id INTEGER NOT NULL,
  mentor_name VARCHAR(255),
  match_score INTEGER NOT NULL,
  match_explanation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  INDEX idx_request_id (request_id),
  INDEX idx_mentor_id (mentor_id),
  INDEX idx_match_score (match_score)
);

-- Comentarios para documentación
COMMENT ON TABLE user_requests IS 'Registro de peticiones de matching de usuarios';
COMMENT ON TABLE user_matches IS 'Matches individuales por cada petición';
COMMENT ON COLUMN user_requests.mentee_looking_for IS 'Texto de lo que busca el mentee';
COMMENT ON COLUMN user_matches.match_score IS 'Puntuación de compatibilidad (0-100)'; 