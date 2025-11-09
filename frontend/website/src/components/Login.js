import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Header from './Header';
import './Login.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [searchParams] = useSearchParams();
  const [isSignUp, setIsSignUp] = useState(searchParams.get('mode') === 'signup');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, signup, user } = useAuth();
  const navigate = useNavigate();

  // Update signup mode when query parameter changes
  useEffect(() => {
    setIsSignUp(searchParams.get('mode') === 'signup');
    setError(''); // Clear error when switching modes
  }, [searchParams]);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let result;
      if (isSignUp) {
        result = await signup(email, password);
      } else {
        result = await login(email, password);
      }

      if (result.error) {
        setError(result.error);
      } else {
        // Navigate to dashboard on successful login/signup
        navigate('/dashboard');
      }
    } catch (err) {
      setError('Failed to authenticate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <Header />
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>{isSignUp ? 'Create Your Account' : 'Welcome Back'}</h1>
            <p className="login-subtitle">
              {isSignUp 
                ? 'Start tracking your carbon footprint and make a difference' 
                : 'Sign in to your account to continue'}
            </p>
          </div>

          {error && (
            <div className="error-alert">
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                disabled={loading}
                minLength={6}
              />
              {isSignUp && (
                <small className="form-hint">Password must be at least 6 characters</small>
              )}
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="login-footer">
            <p>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <button
                type="button"
                className="toggle-button"
                onClick={() => {
                  const newMode = !isSignUp;
                  setIsSignUp(newMode);
                  setError('');
                  navigate(newMode ? '/login?mode=signup' : '/login', { replace: true });
                }}
                disabled={loading}
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;

