import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './TabMenu.css';

const TabMenu = () => {
  const location = useLocation();
  const path = location.pathname;

  return (
    <header className="navbar">
      <div className="navbar-container">
        <h2 className="app-title">Mentoring Matcher</h2>
        <nav className="nav-tabs">
          <Link to="/" className={`nav-tab ${path === '/' ? 'active' : ''}`}>
            Individualizado
          </Link>
          <Link to="/bulk" className={`nav-tab ${path === '/bulk' ? 'active' : ''}`}>
            Bulk
          </Link>
        </nav>
      </div>
    </header>
  );
};

export default TabMenu; 