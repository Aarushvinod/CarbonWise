import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import './AdviceButton.css';

// Generate advice locally as fallback
const generateLocalAdvice = (actions, totalScore, avgScore, highImpactActions, lowImpactActions) => {
  const insights = [];
  const recommendations = [];

  // Generate insights
  if (highImpactActions.length > 0) {
    insights.push(`You have ${highImpactActions.length} high-impact action${highImpactActions.length > 1 ? 's' : ''} with carbon scores above 50 kg CO₂. Focus on reducing these first for maximum impact.`);
    insights.push(`Top concern: "${highImpactActions[0].action}" has a carbon impact of ${highImpactActions[0].sustainabilityScore} kg CO₂.`);
  }

  if (lowImpactActions.length > 0) {
    insights.push(`Great job! You have ${lowImpactActions.length} low-impact action${lowImpactActions.length > 1 ? 's' : ''} with carbon scores below 25 kg CO₂.`);
  }

  const transportationActions = actions.filter(a => a.category === 'Transportation');
  if (transportationActions.length > 0) {
    const transportScore = transportationActions.reduce((sum, a) => sum + a.sustainabilityScore, 0);
    insights.push(`Transportation accounts for ${((transportScore / totalScore) * 100).toFixed(1)}% of your total carbon impact.`);
  }

  insights.push(`Your average carbon impact per action is ${avgScore.toFixed(1)} kg CO₂.`);

  // Generate recommendations
  if (highImpactActions.some(a => a.category === 'Transportation')) {
    recommendations.push('Consider using public transportation, cycling, or walking instead of driving. These alternatives can reduce your transportation carbon footprint by 60-80%.');
  }

  if (highImpactActions.some(a => a.category === 'Energy')) {
    recommendations.push('Optimize your energy usage: turn off lights when not in use, use energy-efficient appliances, and consider renewable energy sources.');
  }

  if (actions.some(a => a.category === 'Food' && a.sustainabilityScore > 20)) {
    recommendations.push('Incorporate more plant-based meals into your diet. Plant-based foods typically have a much lower carbon footprint than meat and dairy.');
  }

  recommendations.push('Continue your positive actions like composting, using reusable items, and choosing sustainable transportation options.');
  
  recommendations.push(`Set a goal to reduce your average carbon impact per action from ${avgScore.toFixed(1)} kg CO₂ to below ${(avgScore * 0.7).toFixed(1)} kg CO₂ over the next month.`);

  return {
    insights: insights.slice(0, 5),
    recommendations: recommendations.slice(0, 5),
    summary: `Based on ${actions.length} tracked actions, you have a total carbon impact of ${totalScore.toFixed(1)} kg CO₂. ${highImpactActions.length > 0 ? 'Focus on reducing high-impact activities, particularly in transportation and energy usage.' : 'Continue your sustainable practices and look for additional opportunities to reduce your carbon footprint.'}`,
  };
};

function AdviceButton({ userActions = [] }) {
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  // Function to save insights to Firestore
  const saveInsightsToFirestore = async (adviceData) => {
    if (!user) return;

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        const currentPreviousAdvice = userData.previousAdvice || {};
        const timestamp = new Date().toISOString();

        // Convert advice data to string for storage
        const adviceString = JSON.stringify(adviceData);

        // Update mostRecentInsightsTimestamp and previousAdvice
        await updateDoc(userDocRef, {
          mostRecentInsightsTimestamp: timestamp,
          previousAdvice: {
            ...currentPreviousAdvice,
            [timestamp]: adviceString,
          },
        });
      }
    } catch (error) {
      console.error('Error saving insights to Firestore:', error);
      // Don't throw error - just log it, as the advice was still generated successfully
    }
  };

  const handleGetAdvice = async () => {
    if (userActions.length === 0) {
      setError('No user actions available. Please record some actions first.');
      return;
    }

    setLoading(true);
    setAdvice(null);
    setError(null);

    // Declare variables outside try block so they're accessible in catch
    let formattedActions = [];
    let totalScore = 0;
    let avgScore = 0;
    let highImpactActions = [];
    let lowImpactActions = [];

    try {
      // Fetch mostRecentInsightsTimestamp from Firestore
      let mostRecentInsightsTimestamp = null;
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            mostRecentInsightsTimestamp = userData.mostRecentInsightsTimestamp || null;
          }
        } catch (error) {
          console.error('Error fetching mostRecentInsightsTimestamp:', error);
          // Continue with all actions if we can't fetch the timestamp
        }
      }

      // Filter actions to only include those after the most recent insights timestamp
      let newActions = userActions;
      if (mostRecentInsightsTimestamp) {
        const lastInsightsDate = new Date(mostRecentInsightsTimestamp);
        newActions = userActions.filter(action => {
          const actionTimestamp = action.timestamp || action.date;
          if (!actionTimestamp) return false;
          return new Date(actionTimestamp) > lastInsightsDate;
        });
      }

      // Check if there are new actions
      if (newActions.length === 0) {
        if (mostRecentInsightsTimestamp) {
          // Fetch and display previous advice
          try {
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
              const userData = userDoc.data();
              const previousAdvice = userData.previousAdvice || {};
              
              // Get the most recent advice (using mostRecentInsightsTimestamp as key)
              const mostRecentAdviceString = previousAdvice[mostRecentInsightsTimestamp];
              if (mostRecentAdviceString) {
                try {
                  const previousAdviceData = JSON.parse(mostRecentAdviceString);
                  setAdvice(previousAdviceData);
                } catch (parseError) {
                  console.error('Error parsing previous advice:', parseError);
                }
              } else {
                // If exact timestamp not found, get the most recent one
                const adviceTimestamps = Object.keys(previousAdvice).sort().reverse();
                if (adviceTimestamps.length > 0) {
                  const latestAdviceString = previousAdvice[adviceTimestamps[0]];
                  try {
                    const previousAdviceData = JSON.parse(latestAdviceString);
                    setAdvice(previousAdviceData);
                  } catch (parseError) {
                    console.error('Error parsing previous advice:', parseError);
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error fetching previous advice:', error);
          }
          
          setError('No new actions since your last insights. Add some new actions to get updated insights!');
        } else {
          setError('No user actions available. Please record some actions first.');
        }
        setLoading(false);
        return;
      }

      // Prepare new actions data with proper formatting
      formattedActions = newActions.map(action => ({
        action: action.action || action.description || action.name || 'Unknown action',
        sustainabilityScore: action.sustainabilityScore || action.score || action.carbonImpact || 0,
        timestamp: action.timestamp || action.date || new Date().toISOString(),
        category: action.category || action.type || 'General',
      }));

      // Calculate statistics for new actions only
      totalScore = formattedActions.reduce((sum, a) => sum + a.sustainabilityScore, 0);
      avgScore = formattedActions.length > 0 ? totalScore / formattedActions.length : 0;
      highImpactActions = formattedActions.filter(a => a.sustainabilityScore > 50);
      lowImpactActions = formattedActions.filter(a => a.sustainabilityScore < 25);

      // Create prompt for Gemini - focus on new actions since last insights
      const timeContext = mostRecentInsightsTimestamp 
        ? `These are NEW actions that occurred since the user's last insights generation (${new Date(mostRecentInsightsTimestamp).toLocaleDateString()}).`
        : `These are the user's actions. This is their first time generating insights.`;

      const prompt = `Analyze the following NEW user actions related to sustainability and carbon footprint. ${timeContext} Generate specific, actionable insights and recommendations based on these recent actions.

New User Actions:
${formattedActions.map((a, i) => 
  `${i + 1}. ${a.action} (Category: ${a.category}, Carbon Impact: ${a.sustainabilityScore} kg CO₂, Date: ${new Date(a.timestamp).toLocaleDateString()})`
).join('\n')}

Statistics for New Actions:
- Total Carbon Impact: ${totalScore.toFixed(1)} kg CO₂
- Average Impact per Action: ${avgScore.toFixed(1)} kg CO₂
- High Impact Actions (>50): ${highImpactActions.length}
- Low Impact Actions (<25): ${lowImpactActions.length}
- Number of New Actions: ${formattedActions.length}

Please provide:
1. 3-5 specific insights about these NEW sustainability actions and patterns
2. 3-5 actionable recommendations to improve their carbon footprint based on these recent actions
3. A brief summary focusing on what has changed or what stands out in these new actions

Respond in JSON format with this structure:
{
  "insights": ["insight 1", "insight 2", ...],
  "recommendations": ["recommendation 1", "recommendation 2", ...],
  "summary": "brief summary text"
}`;

      // Call Gemini API directly
      const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
      
      if (!apiKey) {
        // Fallback: Generate advice locally if API key is not available
        const localAdvice = generateLocalAdvice(formattedActions, totalScore, avgScore, highImpactActions, lowImpactActions);
        setAdvice(localAdvice);
        // Save local advice to Firestore
        await saveInsightsToFirestore(localAdvice);
        return;
      }

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: prompt
              }]
            }]
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errorData = await geminiResponse.text();
        console.error('Gemini API error:', errorData);
        throw new Error(`Gemini API error: ${geminiResponse.statusText}`);
      }

      const geminiData = await geminiResponse.json();
      
      // Extract text from Gemini response
      const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Try to parse JSON from response
      let adviceData;
      try {
        // Extract JSON from markdown code blocks if present
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/```\s*([\s\S]*?)\s*```/);
        const jsonText = jsonMatch ? jsonMatch[1] : responseText;
        adviceData = JSON.parse(jsonText.trim());
      } catch (parseError) {
        // If JSON parsing fails, treat the entire response as a message
        console.warn('Failed to parse JSON, using raw response:', parseError);
        adviceData = {
          message: responseText,
          insights: responseText.split('\n').filter(line => line.trim().length > 0).slice(0, 5),
        };
      }

      setAdvice(adviceData);
      // Save insights to Firestore
      await saveInsightsToFirestore(adviceData);
    } catch (error) {
      console.error('Error fetching advice:', error);
      
      // Fallback to local advice generation on error
      // Note: formattedActions, totalScore, avgScore, highImpactActions, lowImpactActions 
      // are already calculated from new actions only (from the try block above)
      try {
        const localAdvice = generateLocalAdvice(formattedActions, totalScore, avgScore, highImpactActions, lowImpactActions);
        setAdvice(localAdvice);
        // Save local advice to Firestore as well
        await saveInsightsToFirestore(localAdvice);
        setError(null); // Clear error since we have fallback
      } catch (fallbackError) {
        setError(error.message || 'Failed to fetch personalized advice. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="advice-container">
      <button 
        className="advice-button" 
        onClick={handleGetAdvice}
        disabled={loading || userActions.length === 0}
      >
        {loading ? 'Generating Insights...' : 'Get Personalized Advice to Improve Carbon Score'}
      </button>
      
      {error && (
        <div className="advice-error">
          <p>{error}</p>
        </div>
      )}

      {advice && (
        <div className="advice-display">
          {advice.insights && Array.isArray(advice.insights) ? (
            <div>
              <h3>Personalized Sustainability Insights</h3>
              <ul className="insights-list">
                {advice.insights.map((insight, index) => (
                  <li key={index} className="insight-item">
                    {typeof insight === 'string' ? insight : insight.text || insight.insight}
                  </li>
                ))}
              </ul>
            </div>
          ) : advice.recommendations && Array.isArray(advice.recommendations) ? (
            <div>
              <h3>Personalized Recommendations</h3>
              <ul className="insights-list">
                {advice.recommendations.map((rec, index) => (
                  <li key={index} className="insight-item">
                    {typeof rec === 'string' ? rec : rec.text || rec.recommendation}
                  </li>
                ))}
              </ul>
            </div>
          ) : advice.message ? (
            <div>
              <h3>Personalized Advice</h3>
              <p className="advice-text">{advice.message}</p>
            </div>
          ) : (
            <div>
              <h3>Personalized Advice</h3>
              <pre className="advice-text">{JSON.stringify(advice, null, 2)}</pre>
            </div>
          )}
          {advice.summary && (
            <div className="advice-summary">
              <h4>Summary</h4>
              <p>{advice.summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdviceButton;

