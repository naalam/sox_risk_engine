import express from 'express';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Config
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000 // 30 seconds timeout
});

// Risk Assessment Templates
const RISK_TEMPLATES = {
  completeness: {
    systemPrompt: `You are a SOX ITGC expert assessing completeness risks. Structure questions to get:
    1. What specific data/process is incomplete
    2. Where it occurs (system/process)
    3. When it manifests
    4. Operational/financial/reputational impacts
    5. Who is involved/affected
    
    Ask MAX 5 questions at a time. For unclear answers, request clarification.`,
    outputFormat: `Generate risk statement using:
    (Event affecting objectives) caused by (cause/s) resulting in (consequence/s)
    Include: Incomplete element, context, timing, impacts, and responsible parties`
  },
  standard: {
    systemPrompt: `You are a SOX ITGC auditor assessing general controls. 
    First analyze the control description and identify if you need more information.
    Ask clarifying questions in sets of 1-5 questions at a time.
    Maximum 20 questions total.
    Focus on getting details about:
    1. The control failure nature
    2. Frequency of occurrence
    3. Potential impact
    4. Responsible parties
    5. Existing mitigations
    
    Only proceed to risk assessment when you have enough information.`,
    outputFormat: `Provide standard risk assessment with:
    ## Risk Statement
    [Clear 1-2 sentence summary]
    
    ## Assessment Details
    ### Control Failure
    [Detailed description]
    
    ### Frequency
    [How often it occurs]
    
    ### Potential Impact
    [Financial/Operational/Compliance impacts]
    
    ### Responsible Parties
    [Who manages this control]
    
    ## Risk Level
    [Low/Medium/High] - [Brief justification]
    
    ## Recommended Actions
    [3-5 specific, actionable recommendations]`
  }
};

// Track conversation state
const sessionState = new Map();

// Helper Functions
function calculateRiskScore(content) {
  const contentLower = content.toLowerCase();
  let score = 1; // Default low risk

  // Increase score based on risk indicators
  if (contentLower.includes('high risk') || contentLower.includes('critical')) score = 4;
  else if (contentLower.includes('medium risk') || contentLower.includes('moderate')) score = 3;
  else if (contentLower.includes('low risk') || contentLower.includes('minor')) score = 2;
  
  // Content-based scoring
  if (contentLower.includes('financial impact') || contentLower.includes('material')) score += 1;
  if (contentLower.includes('compliance violation') || contentLower.includes('sox')) score += 1;
  if (contentLower.includes('frequent') || contentLower.includes('recurring')) score += 1;

  return Math.min(Math.max(score, 1), 5); // Ensure score is between 1-5
}

function generateControls(mode, content) {
  const baseControls = [
    { attribute: "Documentation", description: "Maintain complete records of all processes" },
    { attribute: "Review", description: "Implement regular completeness checks" }
  ];
  
  if (mode === 'completeness') {
    baseControls.push(
      { attribute: "Validation", description: "Automated validation of mandatory fields" },
      { attribute: "Reconciliation", description: "Periodic reconciliation with source systems" }
    );
    
    if (content.includes('SAP') || content.includes('GRC')) {
      baseControls.push(
        { attribute: "Automated Alerts", description: "Configure alerts for overdue firefighter log reviews" }
      );
    }
  }
  return baseControls;
}

// Combined generateTests function
function generateTests(mode, content) {
  const baseTests = [
    {
      attribute: "Sampling",
      procedure: "Select random samples to verify completeness",
      population: "All transactions in the relevant period",
      extraction: "Extract from system using standard reports or direct database queries",
      frequency: "Quarterly",
      ipe: "System-generated reports, database extracts",
      effectivenessCriteria: {
        effective: "100% of sampled items are complete and accurate",
        ineffective: ">5% error rate in sampled items"
      }
    }
  ];
  
  if (mode === 'completeness') {
    baseTests.push(
      {
        attribute: "Trace",
        procedure: "Trace data from source to destination systems",
        population: "All critical data fields in source system",
        extraction: "Use system interfaces or API calls to verify data flow",
        frequency: "Annually or after major system changes",
        ipe: "System logs, interface monitoring tools",
        effectivenessCriteria: {
          effective: "All traced items show complete data flow without gaps",
          ineffective: "Any breaks in data flow or missing fields"
        }
      }
    );
    
    if (content.includes('SAP') || content.includes('GRC')) {
      baseTests.push(
        {
          attribute: "Firefighter Log Review",
          procedure: "Verify timely review of firefighter access logs",
          population: "All firefighter ID usage logs in the period",
          extraction: "Extract from SAP GRC Firefighter module or transaction FFLR",
          frequency: "Monthly",
          ipe: "SAP GRC reports, FFLR transaction output",
          effectivenessCriteria: {
            effective: "100% of logs reviewed within 14 days with no unauthorized activities",
            ineffective: "Any unreviewed logs beyond 14 days or unauthorized activities found"
          }
        },
        {
          attribute: "Privilege Review",
          procedure: "Review privileged access assignments",
          population: "All users with firefighter or equivalent privileged access",
          extraction: "Extract from SU01 or GRC Access Control module",
          frequency: "Quarterly",
          ipe: "User master reports, GRC access reports",
          effectivenessCriteria: {
            effective: "All privileges are properly authorized and documented",
            ineffective: "Any unauthorized privileges or missing documentation"
          }
        },
        {
          attribute: "SOD Review",
          procedure: "Test segregation of duties conflicts",
          population: "All critical role combinations",
          extraction: "Run GRC SOD report or equivalent",
          frequency: "Semi-annually",
          ipe: "GRC SOD reports, mitigation documentation",
          effectivenessCriteria: {
            effective: "All conflicts properly mitigated or approved",
            ineffective: "Unmitigated conflicts found without approval"
          }
        }
      );
    }
  }

  // Add generic ITGC tests
  baseTests.push(
    {
      attribute: "Change Management",
      procedure: "Verify authorized changes to production",
      population: "All production changes in the period",
      extraction: "Extract from change management system",
      frequency: "Monthly",
      ipe: "Change tickets, approval documentation",
      effectivenessCriteria: {
        effective: "100% of changes properly approved and documented",
        ineffective: "Any unauthorized changes or missing approvals"
      }
    },
    {
      attribute: "Access Reviews",
      procedure: "Test user access recertification",
      population: "All system users with access",
      extraction: "Extract from user access reports",
      frequency: "Quarterly",
      ipe: "Access review certifications",
      effectivenessCriteria: {
        effective: "100% of users properly recertified",
        ineffective: "Any unrecertified active users"
      }
    }
  );

  return baseTests;
}

// Routes
app.post('/api/assess', async (req, res) => {
  try {
    const { sessionId, controlDescription, conversation = [], mode = 'standard' } = req.body;
    const template = RISK_TEMPLATES[mode] || RISK_TEMPLATES.standard;

    // Initialize or get session state
    if (!sessionState.has(sessionId)) {
      sessionState.set(sessionId, {
        questionCount: 0,
        maxQuestions: 20
      });
    }
    const state = sessionState.get(sessionId);

    const messages = [
      { role: "system", content: template.systemPrompt },
      ...conversation.map(c => ({ role: c.role, content: c.content }))
    ];

    // Initial analysis to determine if we need more info
    const analysis = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        ...messages,
        { role: "user", content: `Current question count: ${state.questionCount}/${state.maxQuestions}\n\nControl issue: ${controlDescription}\n\nDo you need clarification? If yes, provide the next set of questions (1-5). If no, say "READY_FOR_ASSESSMENT".` }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    const content = analysis.choices[0].message.content;
    
    if (!content.includes('READY_FOR_ASSESSMENT') && (content.includes('?') || content.includes('clarify'))) {
      const questions = content.split('\n')
        .filter(line => line.trim().endsWith('?') && line.trim().length > 10)
        .slice(0, 5); // Max 5 questions per set
      
      if (questions.length > 0) {
        state.questionCount += questions.length;
        
        // Check if we've hit max questions
        if (state.questionCount >= state.maxQuestions) {
          messages.push({ role: "assistant", content: "Maximum questions reached. Proceeding to assessment." });
        } else {
          return res.json({
            status: "NEEDS_CLARIFICATION",
            questions,
            questionCount: state.questionCount,
            maxQuestions: state.maxQuestions,
            risk_focus: mode
          });
        }
      }
    }

    // Generate final output if no questions needed
    const finalResponse = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        ...messages,
        { role: "user", content: template.outputFormat }
      ],
      temperature: 0.5,
      max_tokens: 1000
    });

    const assessmentContent = finalResponse.choices[0].message.content;
    
    // Clear session state
    sessionState.delete(sessionId);
    
    res.json({
      status: "COMPLETE",
      risk_statement: assessmentContent,
      risk_score: calculateRiskScore(assessmentContent),
      control_activities: generateControls(mode, assessmentContent),
      tests_of_control: generateTests(mode, assessmentContent)
    });

  } catch (error) {
    console.error('Assessment error:', error);
    res.status(500).json({ 
      error: "Assessment failed",
      details: error.message,
      retry_suggestion: "Please check your input and try again. If the problem persists, contact support."
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SOX Auditor AI running on http://localhost:${PORT}`);
});