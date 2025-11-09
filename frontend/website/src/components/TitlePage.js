import React, { useState, useEffect, useRef } from 'react';
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
  const [activeFeature, setActiveFeature] = useState(0);
  const featureRefs = [useRef(null), useRef(null), useRef(null)];
  const sectionRef = useRef(null);

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

  // Scroll-based feature detection
  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '-40% 0px -40% 0px',
      threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
    };

    let activeEntries = [];

    const observerCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const index = featureRefs.findIndex(ref => ref.current === entry.target);
          if (index !== -1) {
            activeEntries = activeEntries.filter(e => e.index !== index);
            activeEntries.push({ index, ratio: entry.intersectionRatio, target: entry.target });
          }
        } else {
          const index = featureRefs.findIndex(ref => ref.current === entry.target);
          if (index !== -1) {
            activeEntries = activeEntries.filter(e => e.index !== index);
          }
        }
      });

      // Find the entry with the highest intersection ratio
      if (activeEntries.length > 0) {
        const mostVisible = activeEntries.reduce((prev, current) => 
          (current.ratio > prev.ratio) ? current : prev
        );
        setActiveFeature(mostVisible.index);
      }
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    // Small delay to ensure refs are set
    const timeoutId = setTimeout(() => {
      featureRefs.forEach(ref => {
        if (ref.current) {
          observer.observe(ref.current);
        }
      });
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      featureRefs.forEach(ref => {
        if (ref.current) {
          observer.unobserve(ref.current);
        }
      });
    };
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
              <a 
                href="https://chrome.google.com/webstore" 
                target="_blank" 
                rel="noopener noreferrer"
                className="cta-button-secondary chrome-button"
              >
                <img 
                  src="/images/chromelogo.png" 
                  alt="Chrome Logo" 
                  className="chrome-logo"
                />
                Add to Chrome
              </a>
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

        {/* Features Section - Terac Style */}
        <section className="features-slider-section">
          <div className="features-slider-container">
            <h2 className="features-slider-title">Everything you need to track your carbon footprint, end to end</h2>
            
            <div className="features-slider-wrapper">
              <div className="features-slider-nav">
                <button 
                  className={`feature-nav-item ${activeFeature === 0 ? 'active' : ''}`}
                  onClick={() => {
                    if (featureRefs[0].current) {
                      featureRefs[0].current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      setTimeout(() => setActiveFeature(0), 100);
                    }
                  }}
                >
                  <span className="feature-number">01</span>
                </button>
                <button 
                  className={`feature-nav-item ${activeFeature === 1 ? 'active' : ''}`}
                  onClick={() => {
                    if (featureRefs[1].current) {
                      featureRefs[1].current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      setTimeout(() => setActiveFeature(1), 100);
                    }
                  }}
                >
                  <span className="feature-number">02</span>
                </button>
                <button 
                  className={`feature-nav-item ${activeFeature === 2 ? 'active' : ''}`}
                  onClick={() => {
                    if (featureRefs[2].current) {
                      featureRefs[2].current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      setTimeout(() => setActiveFeature(2), 100);
                    }
                  }}
                >
                  <span className="feature-number">03</span>
                </button>
              </div>

              <div className="features-slider-content" ref={sectionRef}>
                <div 
                  ref={featureRefs[0]}
                  className={`feature-slide ${activeFeature === 0 ? 'active' : ''}`}
                  data-feature="0"
                >
                  <h3 className="feature-slide-title">Website Dashboard</h3>
                  <p className="feature-slide-description">
                    Log into the CO₂Ldown website to access your comprehensive carbon footprint dashboard. 
                    Track all inputted and automatically collected data in one centralized location. 
                    View your carbon score, recent actions, progress over time, and compete with friends on the leaderboard.
                  </p>
                </div>

                <div 
                  ref={featureRefs[1]}
                  className={`feature-slide ${activeFeature === 1 ? 'active' : ''}`}
                  data-feature="1"
                >
                  <h3 className="feature-slide-title">Real-Time Activity Tracking</h3>
                  <p className="feature-slide-description">
                    The Chrome extension monitors your digital activity in real time as you browse, shop, stream, 
                    and work online. It automatically tracks your actions and calculates their carbon impact, 
                    seamlessly adding each activity to your carbon footprint database without any manual input required.
                  </p>
                </div>

                <div 
                  ref={featureRefs[2]}
                  className={`feature-slide ${activeFeature === 2 ? 'active' : ''}`}
                  data-feature="2"
                >
                  <h3 className="feature-slide-title">AI Prompt Optimization</h3>
                  <p className="feature-slide-description">
                    The Chrome extension intelligently optimizes AI prompts in real time to reduce their carbon footprint. 
                    By analyzing and refining your AI interactions, it helps minimize the computational resources needed 
                    while maintaining effectiveness, automatically lowering your digital carbon impact.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="cta-section">
          <div className="cta-content">
            <h2 className="cta-title">Ready to Make a Difference?</h2>
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

