#!/bin/bash
set -e  # Salir si hay errores

# Navegar al directorio client
cd client

# Construir el proyecto
echo "🏗️ Construyendo el proyecto..."
npm run build

# Verificar que la carpeta build existe
if [ ! -d "build" ]; then
  echo "❌ Error: La carpeta build no se creó correctamente."
  exit 1
fi

# Desplegar especificando el directorio explícitamente
echo "🚀 Desplegando a Netlify..."
netlify deploy --prod --dir=build

echo "✅ Despliegue completado" 