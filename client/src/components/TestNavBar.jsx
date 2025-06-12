import React from 'react';
import { Link } from 'react-router-dom';

const TestNavBar = () => {
  return (
    <div style={{ 
      background: 'red', 
      padding: '20px', 
      margin: '20px', 
      color: 'white',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999
    }}>
      <h2>PRUEBA DE NAVEGACIÓN</h2>
      <Link to="/" style={{color: 'white', marginRight: '20px'}}>Individual</Link>
      <Link to="/bulk" style={{color: 'white'}}>Bulk</Link>
    </div>
  );
};

export default TestNavBar; 