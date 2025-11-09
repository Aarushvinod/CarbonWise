import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Header.css';

function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  const handleSignInClick = () => {
    navigate('/login');
  };

  const handleSignUpClick = () => {
    navigate('/login?mode=signup');
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo-container" onClick={() => navigate('/')}>
          <img 
            src="/images/LOGONEW 2.png" 
            alt="CO₂Ldown Logo" 
            className="logo-image"
          />
        </div>
      </div>
      <div className="header-divider"></div>
      <div className="header-right">
        <button 
          className={`header-button ${isLoginPage ? 'active' : ''}`}
          onClick={handleSignInClick}
        >
          Sign In
        </button>
        <button 
          className="header-button header-button-primary"
          onClick={handleSignUpClick}
        >
          Sign Up
        </button>
      </div>
    </header>
  );
}

export default Header;

