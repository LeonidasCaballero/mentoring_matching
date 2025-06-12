import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './TabMenu.css';

const TabMenu = () => {
  const location = useLocation();
  const path = location.pathname;

  return (
    <header className="top-bar">
      <div className="top-bar-container">
        <h2 className="app-title">Mentoring Matcher</h2>
        <nav className="nav-options">
          <Link to="/" className={`nav-option ${path === '/' ? 'active' : ''}`}>
            Individualizado
          </Link>
          <Link to="/bulk" className={`nav-option ${path === '/bulk' ? 'active' : ''}`}>
            Bulk
          </Link>
        </nav>
      </div>
    </header>
  );
};

export default TabMenu; 