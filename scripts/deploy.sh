#!/bin/bash

# 1. Construir el frontend
echo "Construyendo frontend..."
cd client
npm run build

# 2. Desplegar en Netlify (usando Netlify CLI)
echo "Desplegando en Netlify..."
netlify deploy --prod

# 3. Mensaje para desplegar backend manualmente
echo "No olvides desplegar el backend en Render/Railway/Heroku!" 