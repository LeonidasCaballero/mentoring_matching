import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TabMenu from './components/TabMenu';
import BulkPage from './pages/BulkPage';
import './App.css';

// Importa los componentes originales que necesites mantener en la página principal
// import OriginalHomeComponent from './components/OriginalHomeComponent';

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <TabMenu />
        <div className="main-content">
          <Routes>
            <Route path="/" element={
              <div className="container">
                <h1 className="text-center mb-4">Mentoring Matcher</h1>
                {/* Aquí irían los componentes originales de la página principal,
                    excepto el indicador de "Conectado" */}
                {/* <OriginalHomeComponent /> */}
              </div>
            } />
            <Route path="/bulk" element={<BulkPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </div>
  );
}

export default App; 