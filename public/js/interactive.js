// public/js/interactive.js
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const chatMessages = document.getElementById('chat-messages');
  const userInput = document.getElementById('user-input');
  const auditorForm = document.getElementById('auditor-form');
  const questionsContainer = document.getElementById('questions-container');
  const riskResult = document.getElementById('risk-result');
  const riskOutput = document.getElementById('risk-output');
  const loadingSpinner = document.getElementById('loading-spinner');

  // State
  let conversationHistory = [];
  let currentQuestions = [];

  // Add message to chat
  function addMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    
    const headerDiv = document.createElement('div');
    headerDiv.className = `${role}-header`;
    headerDiv.innerHTML = `<strong>${role === 'auditor' ? 'Lead Auditor' : 'You'}:</strong>`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;
    
    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Show loading state
  function showLoading(show) {
    loadingSpinner.style.display = show ? 'block' : 'none';
    userInput.disabled = show;
  }

  // Display auditor questions
  function showAuditorQuestions(questions) {
    questionsContainer.innerHTML = '';
    currentQuestions = questions;
    
    questions.forEach((question, index) => {
      const group = document.createElement('div');
      group.className = 'form-group';
      group.innerHTML = `
        <label>${question}</label>
        <textarea id="response-${index}" rows="2" placeholder="Your response..."></textarea>
      `;
      questionsContainer.appendChild(group);
    });
    
    auditorForm.style.display = 'block';
    riskResult.style.display = 'none';
  }

  // Show final risk assessment
  function showRiskAssessment(result) {
    riskOutput.innerHTML = `
      <div class="risk-score">Risk Score: ${result.risk_score}/5</div>
      
      <div class="result-section">
        <h3>Risk Statement</h3>
        <p>${result.risk_statement}</p>
      </div>
      
      <div class="result-section">
        <h3>Control Objective</h3>
        <p>${result.control_objective}</p>
      </div>
      
      <div class="result-section">
        <h3>Control Activities</h3>
        <ul class="attribute-list">
          ${result.control_activities.map(activity => `
            <li>
              <span class="attribute">${activity.attribute}:</span>
              ${activity.description}
            </li>
          `).join('')}
        </ul>
      </div>
      
      <div class="result-section">
        <h3>Tests of Control</h3>
        <ul class="attribute-list">
          ${result.tests_of_control.map(test => `
            <li>
              <span class="attribute">${test.attribute}:</span>
              ${test.procedure}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
    
    riskResult.style.display = 'block';
    auditorForm.style.display = 'none';
  }

  // Start risk assessment
  async function startAssessment() {
    const text = userInput.value.trim();
    if (!text) return;
    
    addMessage('user', text);
    conversationHistory.push({ role: 'user', content: text });
    userInput.value = '';
    
    showLoading(true);
    
    try {
      const response = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          controlDescription: text,
          conversation: conversationHistory,
          mode: 'standard'
        })
      });
      
      const data = await response.json();
      
      if (data.status === "NEEDS_CLARIFICATION") {
        addMessage('auditor', 'To properly assess this risk, I need additional information:');
        showAuditorQuestions(data.questions);
      } else {
        showRiskAssessment(data);
      }
    } catch (error) {
      console.error('Assessment failed:', error);
      addMessage('auditor', 'Error: Could not complete assessment. Please try again.');
    } finally {
      showLoading(false);
    }
  }

  // Submit auditor responses
  async function submitAuditorResponses() {
    const responses = currentQuestions.map((question, index) => {
      return {
        question,
        response: document.getElementById(`response-${index}`).value
      };
    });
    
    const responseText = responses.map(r => 
      `Q: ${r.question}\nA: ${r.response}`
    ).join('\n\n');
    
    addMessage('user', 'Additional Information:\n' + responseText);
    conversationHistory.push({ 
      role: 'user', 
      content: responseText 
    });
    
    auditorForm.style.display = 'none';
    showLoading(true);
    
    try {
      const response = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          controlDescription: '',
          conversation: conversationHistory,
          mode: 'auditor_full'
        })
      });
      
      const data = await response.json();
      showRiskAssessment(data);
    } catch (error) {
      console.error('Final assessment failed:', error);
      addMessage('auditor', 'Error: Could not complete final assessment. Please try again.');
    } finally {
      showLoading(false);
    }
  }

  // Event Listeners
  document.querySelector('button[onclick="startAssessment()"]')
    .addEventListener('click', startAssessment);
  
  document.querySelector('button[onclick="submitAuditorResponses()"]')
    .addEventListener('click', submitAuditorResponses);
    
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      startAssessment();
    }
  });
});