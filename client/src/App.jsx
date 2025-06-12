import React from 'react';
import { Routes, Route } from 'react-router-dom';
import TestNavBar from './components/TestNavBar';
import BulkPage from './pages/BulkPage';
import './App.css';

function App() {
  return (
    <div className="App">
      <TestNavBar />
      <div className="main-content">
        <Routes>
          <Route path="/" element={
            <div className="container">
              <h1 className="text-center mb-4">Mentoring Matcher</h1>
              {/* Aquí irían los componentes originales de la página principal,
                  sin incluir el indicador de "Conectado" */}
            </div>
          } />
          <Route path="/bulk" element={<BulkPage />} />
        </Routes>
      </div>
    </div>
  );
}

export default App; 