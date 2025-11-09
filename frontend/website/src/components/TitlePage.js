import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import './TitlePage.css';

function TitlePage() {
  const navigate = useNavigate();
  const [displayValue, setDisplayValue] = useState('-2.4kg');
  const [isDeleting, setIsDeleting] = useState(false);
  const [targetValue, setTargetValue] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isWaiting, setIsWaiting] = useState(false);

  useEffect(() => {
    let interval;
    
    if (isWaiting) {
      // Waiting phase - do nothing, will transition to deleting after timeout
      return;
    }
    
    if (isDeleting) {
      // Delete phase - remove characters one by one, but keep the "-" sign
      interval = setInterval(() => {
        setDisplayValue(prev => {
          if (prev.length > 1) { // Keep at least the "-" sign
            return prev.slice(0, -1);
          } else {
            // Finished deleting (only "-" remains), generate new number and start typing
            const newNumber = Math.floor(Math.random() * 100) + 1; // 1 to 100
            const newValue = `-${newNumber}kg`;
            setTargetValue(newValue);
            setIsDeleting(false);
            setCurrentIndex(0); // Will be incremented to 1 on first typing step
            return '-'; // Keep the "-" sign
          }
        });
      }, 100);
    } else if (targetValue && currentIndex < targetValue.length - 1) {
      // Typing phase - add characters one by one (currentIndex tracks position after "-")
      interval = setInterval(() => {
        setCurrentIndex(prev => {
          const nextIndex = prev + 1;
          // Show from start (index 0) to nextIndex + 1 (to include the character at nextIndex)
          setDisplayValue(targetValue.slice(0, nextIndex + 1));
          if (nextIndex + 1 >= targetValue.length) {
            // Finished typing, wait then start deleting
            setTargetValue('');
            setIsWaiting(true);
            setTimeout(() => {
              setIsWaiting(false);
              setIsDeleting(true);
            }, 3000); // Wait 3 seconds before starting to delete
          }
          return nextIndex;
        });
      }, 150);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isDeleting, targetValue, currentIndex, isWaiting]);

  // Start the cycle after initial display
  useEffect(() => {
    const startCycle = setTimeout(() => {
      setIsDeleting(true);
    }, 3000); // Wait 3 seconds before starting to delete

    return () => clearTimeout(startCycle);
  }, []);

  return (
    <div className="title-page">
      <Header />
      <div className="title-content">
        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-content">
            <h1 className="hero-title">
              Track Your Carbon Footprint.<br />
              <span className="hero-highlight">Make a Real Impact.</span>
            </h1>
            <p className="hero-subtitle">
              CO₂Ldown monitors your everyday digital actions and provides real-time carbon feedback. 
              Compete with friends, track your progress, and help save the environment—one click at a time.
            </p>
            <div className="hero-buttons">
              <button className="cta-button-primary" onClick={() => navigate('/login?mode=signup')}>
                Get Started
              </button>
              <button className="cta-button-secondary" onClick={() => navigate('/login')}>
                Sign In
              </button>
            </div>
          </div>
          <div className="hero-image">
            <div className="hero-visual">
              <div className="carbon-card">
                <div className="carbon-icon">🌱</div>
                <div className="carbon-value">
                  {displayValue}
                  <span className="typing-cursor">|</span>
                </div>
                <div className="carbon-label">CO₂ Saved Today</div>
              </div>
            </div>
          </div>
        </section>

        {/* Inspiration Section */}
        <section className="content-section">
          <div className="section-content">
            <div className="section-text">
              <h2 className="section-title">Our Inspiration</h2>
              <p className="section-description">
                We noticed that most people around us agreed that climate change was a major issue, 
                but many didn't know what they could do to help fight it. We're already online all day, 
                so we set out to monitor everyday digital actions—such as shopping, booking flights, 
                and streaming—and add real-time carbon feedback.
              </p>
            </div>
            <div className="section-image">
              <div className="inspiration-visual">
                <div className="activity-item">
                  <span className="activity-icon">🛒</span>
                  <span className="activity-text">Shopping</span>
                </div>
                <div className="activity-item">
                  <span className="activity-icon">✈️</span>
                  <span className="activity-text">Flights</span>
                </div>
                <div className="activity-item">
                  <span className="activity-icon">📺</span>
                  <span className="activity-text">Streaming</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What It Does Section */}
        <section className="content-section content-section-alt">
          <div className="section-content">
            <div className="section-image">
              <div className="features-visual">
                <div className="feature-card">
                  <div className="feature-icon">🤖</div>
                  <div className="feature-title">AI-Powered</div>
                  <div className="feature-desc">Smart suggestions tailored to you</div>
                </div>
                <div className="feature-card">
                  <div className="feature-icon">📊</div>
                  <div className="feature-title">Track Progress</div>
                  <div className="feature-desc">Monthly insights and analytics</div>
                </div>
                <div className="feature-card">
                  <div className="feature-icon">🏆</div>
                  <div className="feature-title">Compete</div>
                  <div className="feature-desc">Challenge friends and climb the leaderboard</div>
                </div>
              </div>
            </div>
            <div className="section-text">
              <h2 className="section-title">What It Does</h2>
              <p className="section-description">
                CO₂Ldown is an AI-powered app that monitors user activity online to give them 
                suggestions on how they can improve their carbon footprint. You can track your 
                progress on a monthly basis and compete with friends, all while helping to save 
                the environment!
              </p>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="cta-section">
          <div className="cta-content">
            <h2 className="cta-title">Ready to Make a Difference?</h2>
            <p className="cta-text">Join thousands of users tracking their carbon footprint and competing to save the planet.</p>
            <button className="cta-button-large" onClick={() => navigate('/login?mode=signup')}>
              Start Your Journey
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default TitlePage;

