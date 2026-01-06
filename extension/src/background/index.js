// Sidecar Background Service Worker

// ============================================================================
// Storage Keys
// ============================================================================

const STORAGE_KEYS = {
  SITUATIONS: 'sidecar_situations',
  SETTINGS: 'sidecar_settings',
  BRIEFS: 'sidecar_briefs',
};

// ============================================================================
// Default Settings
// ============================================================================

const DEFAULT_SETTINGS = {
  localLlmEndpoint: 'http://localhost:11434',
  localLlmModel: 'llama3:8b',
  cloudLlmEnabled: false,
  cloudLlmApiKey: '',
  theme: 'system',
  autoCapture: false,
  captureSlack: true,
  captureGmail: true,
};

// ============================================================================
// Message Handler
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(err => sendResponse({ success: false, error: err.message }));
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  const payload = message.payload || {};

  switch (message.type) {
    // Situations
    case 'GET_SITUATIONS':
      return { success: true, data: await getSituations() };

    case 'GET_SITUATION':
      if (!payload.id) return { success: false, error: 'Missing situation id' };
      return { success: true, data: await getSituation(payload.id) };

    case 'CREATE_SITUATION':
      if (!payload.title) return { success: false, error: 'Missing title' };
      return { success: true, data: await createSituation(payload) };

    case 'UPDATE_SITUATION':
      if (!payload.id) return { success: false, error: 'Missing situation id' };
      return { success: true, data: await updateSituation(payload.id, payload) };

    case 'DELETE_SITUATION':
      if (!payload.id) return { success: false, error: 'Missing situation id' };
      await deleteSituation(payload.id);
      return { success: true };

    // Communications
    case 'ADD_COMMUNICATION':
      if (!payload.situationId) return { success: false, error: 'Missing situationId' };
      if (!payload.communication) return { success: false, error: 'Missing communication' };
      return {
        success: true,
        data: await addCommunication(payload.situationId, payload.communication)
      };

    // Capture content from content scripts
    case 'CAPTURE_CONTENT':
      // Store captured content temporarily for the side panel to pick up
      await chrome.storage.local.set({ 'sidecar_pending_capture': payload });
      return { success: true };

    // Participants
    case 'ADD_PARTICIPANT':
      if (!payload.situationId) return { success: false, error: 'Missing situationId' };
      if (!payload.participant) return { success: false, error: 'Missing participant' };
      return {
        success: true,
        data: await addParticipant(payload.situationId, payload.participant)
      };

    case 'REMOVE_PARTICIPANT':
      if (!payload.situationId || !payload.participantId) {
        return { success: false, error: 'Missing situationId or participantId' };
      }
      await removeParticipant(payload.situationId, payload.participantId);
      return { success: true };

    // Brief
    case 'GET_BRIEF':
      if (!payload.situationId) return { success: false, error: 'Missing situationId' };
      return { success: true, data: await getBrief(payload.situationId) };

    case 'GENERATE_BRIEF':
      if (!payload.situationId) return { success: false, error: 'Missing situationId' };
      return { success: true, data: await generateBrief(payload.situationId) };

    // Settings
    case 'GET_SETTINGS':
      return { success: true, data: await getSettings() };

    case 'UPDATE_SETTINGS':
      return { success: true, data: await updateSettings(payload) };

    // Data Management
    case 'EXPORT_DATA':
      return { success: true, data: await exportData() };

    case 'IMPORT_DATA':
      if (!payload.data) return { success: false, error: 'Missing data' };
      await importData(payload.data);
      return { success: true };

    case 'CLEAR_DATA':
      await clearData();
      return { success: true };

    case 'GET_STORAGE_USAGE':
      return { success: true, data: await getStorageUsage() };

    // Side Panel
    case 'OPEN_SIDEPANEL':
      if (sender.tab) {
        await chrome.sidePanel.open({ tabId: sender.tab.id });
      }
      return { success: true };

    default:
      console.warn('Unknown message type:', message.type);
      return { success: false, error: `Unknown message type: ${message.type}` };
  }
}

// ============================================================================
// Situation Operations
// ============================================================================

async function getSituations() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SITUATIONS);
  return result[STORAGE_KEYS.SITUATIONS] || [];
}

async function getSituation(id) {
  const situations = await getSituations();
  return situations.find(s => s.id === id);
}

async function saveSituation(situation) {
  const situations = await getSituations();
  const index = situations.findIndex(s => s.id === situation.id);

  if (index >= 0) {
    situations[index] = situation;
  } else {
    situations.unshift(situation);
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.SITUATIONS]: situations });
}

async function createSituation({ title, description = '' }) {
  const now = new Date().toISOString();
  const situation = {
    id: generateId(),
    title,
    description,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    participants: [],
    communications: [],
  };

  await saveSituation(situation);
  return situation;
}

async function updateSituation(id, updates) {
  const situation = await getSituation(id);
  if (!situation) return null;

  const updated = {
    ...situation,
    ...updates,
    id: situation.id, // Ensure ID doesn't change
    createdAt: situation.createdAt, // Ensure createdAt doesn't change
    updatedAt: new Date().toISOString(),
  };

  await saveSituation(updated);
  return updated;
}

async function deleteSituation(id) {
  const situations = await getSituations();
  const filtered = situations.filter(s => s.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.SITUATIONS]: filtered });

  // Also delete brief
  const briefs = await getBriefs();
  delete briefs[id];
  await chrome.storage.local.set({ [STORAGE_KEYS.BRIEFS]: briefs });
}

// ============================================================================
// Communication Operations
// ============================================================================

async function addCommunication(situationId, communication) {
  const situation = await getSituation(situationId);
  if (!situation) return null;

  const newComm = {
    ...communication,
    id: generateId(),
    situationId,
  };

  situation.communications = situation.communications || [];
  situation.communications.push(newComm);
  situation.updatedAt = new Date().toISOString();

  await saveSituation(situation);
  return newComm;
}

// ============================================================================
// Participant Operations
// ============================================================================

async function addParticipant(situationId, participant) {
  const situation = await getSituation(situationId);
  if (!situation) return null;

  const newParticipant = {
    ...participant,
    id: generateId(),
  };

  situation.participants = situation.participants || [];
  situation.participants.push(newParticipant);
  situation.updatedAt = new Date().toISOString();

  await saveSituation(situation);
  return newParticipant;
}

async function removeParticipant(situationId, participantId) {
  const situation = await getSituation(situationId);
  if (!situation) return;

  situation.participants = (situation.participants || []).filter(p => p.id !== participantId);
  situation.updatedAt = new Date().toISOString();

  await saveSituation(situation);
}

// ============================================================================
// Brief Operations
// ============================================================================

async function getBriefs() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.BRIEFS);
  return result[STORAGE_KEYS.BRIEFS] || {};
}

async function getBrief(situationId) {
  const briefs = await getBriefs();
  return briefs[situationId];
}

async function saveBrief(brief) {
  const briefs = await getBriefs();
  briefs[brief.situationId] = brief;
  await chrome.storage.local.set({ [STORAGE_KEYS.BRIEFS]: briefs });
}

async function generateBrief(situationId) {
  const situation = await getSituation(situationId);
  if (!situation) throw new Error('Situation not found');

  const settings = await getSettings();

  // Prepare content for LLM
  const communicationsSummary = situation.communications
    ?.slice(0, 20)
    .map(c => `[${c.source}] ${c.content}`)
    .join('\n---\n') || 'No communications yet';

  const participantsList = situation.participants
    ?.map(p => `${p.name} (${p.role || 'participant'})`)
    .join(', ') || 'No participants';

  const prompt = `Analyze this workplace situation and provide actionable insights.

SITUATION: ${situation.title}
${situation.description ? `DESCRIPTION: ${situation.description}` : ''}

PARTICIPANTS: ${participantsList}

RECENT COMMUNICATIONS:
${communicationsSummary}

Provide your analysis in the following JSON format:
{
  "summary": "2-3 sentence summary of the current state",
  "stakeholders": [
    {
      "name": "person name",
      "currentStance": "their current position",
      "recentTone": "positive|neutral|negative|mixed",
      "keyPoints": ["point 1", "point 2"],
      "suggestedApproach": "how to engage with them"
    }
  ],
  "suggestedNextSteps": [
    {
      "priority": 1,
      "action": "specific action to take",
      "rationale": "why this action",
      "suggestedQuestions": ["question to ask"]
    }
  ],
  "riskLevel": "low|medium|high",
  "topRisks": [
    {
      "type": "disengagement|escalation|misalignment|blocker",
      "severity": "low|medium|high",
      "description": "what the risk is"
    }
  ]
}

JSON Response:`;

  try {
    // Call local LLM
    const response = await fetch(`${settings.localLlmEndpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.localLlmModel,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 2048,
        }
      })
    });

    if (!response.ok) {
      throw new Error('LLM request failed');
    }

    const data = await response.json();
    const responseText = data.response;

    // Parse JSON from response - find the outermost JSON object
    let analysis;
    try {
      // Try to find JSON object in response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      throw new Error('Could not parse LLM response as JSON');
    }

    // Helper to match stakeholder to participant by name
    const findParticipantId = (stakeholderName) => {
      const participant = situation.participants?.find(p =>
        p.name?.toLowerCase() === stakeholderName?.toLowerCase()
      );
      return participant?.id || `unknown-${stakeholderName || 'participant'}`;
    };

    const brief = {
      situationId,
      generatedAt: new Date().toISOString(),
      title: situation.title,
      summary: analysis.summary || 'Analysis not available',
      stakeholders: (analysis.stakeholders || []).map((s) => ({
        participantId: findParticipantId(s.name),
        name: s.name || 'Unknown',
        role: s.role || 'Participant',
        currentStance: s.currentStance || '',
        recentTone: s.recentTone || 'neutral',
        keyPoints: s.keyPoints || [],
        suggestedApproach: s.suggestedApproach || ''
      })),
      unresolvedItems: [],
      suggestedNextSteps: (analysis.suggestedNextSteps || []).map((a, i) => ({
        priority: a.priority || i + 1,
        action: a.action || '',
        rationale: a.rationale || '',
        suggestedQuestions: a.suggestedQuestions || []
      })),
      riskLevel: analysis.riskLevel || 'low',
      topRisks: (analysis.topRisks || []).map(r => ({
        type: r.type || 'misalignment',
        severity: r.severity || 'low',
        description: r.description || '',
        evidence: r.evidence || []
      }))
    };

    await saveBrief(brief);

    // Also update situation with analysis summary
    situation.analysis = {
      generatedAt: brief.generatedAt,
      summary: brief.summary,
      stakeholderAnalysis: brief.stakeholders,
      toneTrajectory: [],
      unresolvedThreads: [],
      riskSignals: brief.topRisks,
      suggestedActions: brief.suggestedNextSteps,
      relatedSituations: []
    };
    await saveSituation(situation);

    return brief;
  } catch (error) {
    console.error('Failed to generate brief:', error);

    // Return a fallback brief
    const fallbackBrief = {
      situationId,
      generatedAt: new Date().toISOString(),
      title: situation.title,
      summary: 'Unable to generate analysis. Please check that your local LLM is running.',
      stakeholders: [],
      unresolvedItems: [],
      suggestedNextSteps: [{
        priority: 1,
        action: 'Review the communications directly',
        rationale: 'Manual review recommended when automated analysis is unavailable',
        suggestedQuestions: []
      }],
      riskLevel: 'low',
      topRisks: []
    };

    await saveBrief(fallbackBrief);
    return fallbackBrief;
  }
}

// ============================================================================
// Settings Operations
// ============================================================================

async function getSettings() {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] };
}

async function updateSettings(updates) {
  const current = await getSettings();
  const updated = { ...current, ...updates };
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: updated });
  return updated;
}

// ============================================================================
// Data Management
// ============================================================================

async function exportData() {
  const situations = await getSituations();
  const settings = await getSettings();
  const briefs = await getBriefs();

  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    situations,
    settings,
    briefs,
  }, null, 2);
}

async function importData(jsonData) {
  const data = JSON.parse(jsonData);

  if (data.situations) {
    await chrome.storage.local.set({ [STORAGE_KEYS.SITUATIONS]: data.situations });
  }
  if (data.settings) {
    await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: data.settings });
  }
  if (data.briefs) {
    await chrome.storage.local.set({ [STORAGE_KEYS.BRIEFS]: data.briefs });
  }
}

async function clearData() {
  await chrome.storage.local.clear();
  await chrome.storage.sync.clear();
}

async function getStorageUsage() {
  const bytesInUse = await chrome.storage.local.getBytesInUse();
  const quota = chrome.storage.local.QUOTA_BYTES;
  return {
    used: bytesInUse,
    total: quota,
    percentage: (bytesInUse / quota) * 100,
  };
}

// ============================================================================
// Utilities
// ============================================================================

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// ============================================================================
// Extension Events
// ============================================================================

// Handle extension installation
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Set default settings
    await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS });

    // Enable side panel
    await chrome.sidePanel.setOptions({
      enabled: true,
      path: 'src/sidepanel/sidepanel.html'
    });
  }
});

// Handle side panel behavior
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((error) => console.error(error));

// Context menu for capturing content
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'capture-to-sidecar',
    title: 'Add to Sidecar Situation',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'capture-to-sidecar' && info.selectionText) {
    // Open side panel and pass the selected text
    chrome.sidePanel.open({ tabId: tab.id });
    // The content script will handle the actual capture
  }
});

console.log('Sidecar background service worker initialized');
