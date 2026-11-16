/* Chess Coach — settings schema
 *
 * Every setting here is wired to real behaviour; nothing is decorative. The
 * app renders its Settings tab from this file, so adding a setting is a
 * one-object change, not a code change.
 *
 * Field shape:
 *   { id, label, type, default, group, tier, help, options, min, max, step,
 *     unit, live }
 *
 * type:    toggle | select | range | number | text | textarea | color | password | button
 * tier:    'core' (shown by default) | 'advanced' | 'lab' (experimental)
 * live:    true  = applies immediately on change
 *          false = needs the "Apply" nudge (engine restarts, review re-runs)
 */
(function (root) {
  'use strict';

  function t(id, label, def, group, extra) {
    return Object.assign({ id: id, label: label, type: 'toggle', default: def, group: group, tier: 'core' }, extra || {});
  }
  function sel(id, label, def, group, options, extra) {
    return Object.assign({ id: id, label: label, type: 'select', default: def, group: group, options: options, tier: 'core' }, extra || {});
  }
  function rng(id, label, def, min, max, step, group, extra) {
    return Object.assign({ id: id, label: label, type: 'range', default: def, min: min, max: max, step: step, group: group, tier: 'core' }, extra || {});
  }
  function num(id, label, def, min, max, step, group, extra) {
    return Object.assign({ id: id, label: label, type: 'number', default: def, min: min, max: max, step: step, group: group, tier: 'advanced' }, extra || {});
  }
  function txt(id, label, def, group, extra) {
    return Object.assign({ id: id, label: label, type: 'text', default: def, group: group, tier: 'advanced' }, extra || {});
  }

  var BOARD_THEMES = {
    brown:   { light: '#f0d9b5', dark: '#b58863', name: 'Brown (classic)' },
    green:   { light: '#eeeed2', dark: '#769656', name: 'Green (tournament)' },
    blue:    { light: '#dee3e6', dark: '#8ca2ad', name: 'Blue (ICC)' },
    slate:   { light: '#d8d8d8', dark: '#6f7b86', name: 'Slate' },
    walnut:  { light: '#e8d3b0', dark: '#9b6b43', name: 'Walnut' },
    rose:    { light: '#f6e0e0', dark: '#c07474', name: 'Rose' },
    mint:    { light: '#e8f2e8', dark: '#6f9f7f', name: 'Mint' },
    purple:  { light: '#e6e0f0', dark: '#8f7fb8', name: 'Purple' },
    highcontrast: { light: '#ffffff', dark: '#4a4a4a', name: 'High contrast' },
    colorblind:   { light: '#f5e6c8', dark: '#0072b2', name: 'Colorblind safe' }
  };

  var PIECE_SETS = {
    unicode: 'Unicode glyphs',
    solid:   'Solid glyphs',
    outline: 'Outline glyphs'
  };

  var PERSONAS = {
    beginner: 'You are a patient beginner-friendly coach. Use plain language, avoid jargon, and always explain any chess term you use in a few words. Focus on one or two ideas per answer.',
    intermediate: 'You are a club-level chess coach. Explain plans, pawn structure, and typical tactical motifs. Use standard chess vocabulary without over-explaining it.',
    advanced: 'You are a strong tournament coach. Be precise about evaluation, candidate moves, prophylaxis, and concrete lines. Assume the reader knows standard terminology.',
    kid: 'You are a friendly coach talking to a child. Keep sentences short, be encouraging, and use simple comparisons. Never be condescending.',
    ruthless: 'You are a blunt, demanding coach. Name the mistake plainly, explain why it loses, and give the correction. No praise unless it is earned.'
  };

  var sections = [
    // ------------------------------------------------------------- Board
    {
      id: 'board', title: 'Board', icon: '▦',
      fields: [
        sel('boardTheme', 'Board theme', 'brown', 'Appearance', BOARD_THEMES, { live: true, themeMap: true }),
        sel('pieceSet', 'Piece style', 'solid', 'Appearance', PIECE_SETS, { live: true }),
        rng('pieceSize', 'Piece size', 100, 60, 130, 5, 'Appearance', { live: true, unit: '%' }),
        t('coordinates', 'Show coordinates', true, 'Appearance', { live: true }),
        t('coordinateOutside', 'Coordinates outside board', false, 'Appearance', { live: true, tier: 'advanced' }),
        t('animateMoves', 'Animate moves', true, 'Motion', { live: true }),
        rng('animationMs', 'Animation speed', 120, 0, 400, 10, 'Motion', { live: true, tier: 'advanced', unit: 'ms' }),
        t('highlightLastMove', 'Highlight last move', true, 'Highlights', { live: true }),
        t('highlightCheck', 'Highlight king in check', true, 'Highlights', { live: true }),
        t('showLegalMoves', 'Show legal move dots', true, 'Highlights', { live: true }),
        t('showCaptureRings', 'Ring captures instead of dots', true, 'Highlights', { live: true }),
        t('highlightHovered', 'Highlight hovered square', false, 'Highlights', { live: true, tier: 'advanced' }),
        sel('lastMoveStyle', 'Last-move highlight', 'outline', 'Highlights', { outline: 'Outline', fill: 'Fill', both: 'Both' }, { live: true, tier: 'advanced' }),
        t('coordsOnAllSquares', 'Coordinate on every square', false, 'Highlights', { live: true, tier: 'lab' }),
        t('threatOverlay', 'Show threatened squares', false, 'Highlights', { live: true, tier: 'lab' }),
        t('clickToMove', 'Click to move', true, 'Input', { live: true }),
        t('dragToMove', 'Drag to move', true, 'Input', { live: true }),
        t('autoPromoteQueen', 'Auto-promote to queen', false, 'Input', { live: true }),
        t('confirmResign', 'Confirm before resigning', true, 'Input', { live: true, tier: 'advanced' }),
        t('sounds', 'Sound effects', false, 'Sound', { live: true }),
        rng('soundVolume', 'Volume', 50, 0, 100, 5, 'Sound', { live: true, tier: 'advanced', unit: '%' }),
        t('soundOnCapture', 'Sound on capture', true, 'Sound', { live: true, tier: 'advanced' }),
        sel('startingSide', 'Flip board for black', 'auto', 'Orientation', { auto: 'Auto', white: 'White', black: 'Black' }, { live: true }),
        t('mirrorOnFlip', 'Mirror coordinates on flip', true, 'Orientation', { live: true, tier: 'advanced' }),
        rng('borderRadius', 'Corner rounding', 8, 0, 24, 1, 'Appearance', { live: true, tier: 'advanced', unit: 'px' }),
        rng('boardBrightness', 'Brightness', 100, 60, 140, 5, 'Appearance', { live: true, tier: 'advanced', unit: '%' }),
        rng('boardContrast', 'Contrast', 100, 60, 140, 5, 'Appearance', { live: true, tier: 'advanced', unit: '%' }),
        t('boardShadow', 'Drop shadow', true, 'Appearance', { live: true, tier: 'advanced' }),
        t('showEvalBar', 'Show evaluation bar', true, 'Evaluation', { live: true }),
        sel('evalBarSide', 'Eval bar position', 'left', 'Evaluation', { left: 'Left', right: 'Right', none: 'Hidden' }, { live: true }),
        t('evalBarNumbers', 'Numbers on eval bar', true, 'Evaluation', { live: true, tier: 'advanced' }),
        sel('evalFormat', 'Evaluation format', 'pawns', 'Evaluation', { pawns: 'Pawns (+1.5)', centipawns: 'Centipawns (+150)', mate: 'Mate distance' }, { live: true }),
        t('whitePerspectiveEval', 'Always show white point of view', true, 'Evaluation', { live: true, tier: 'advanced' })
      ]
    },

    // ------------------------------------------------------------ Engine
    {
      id: 'engine', title: 'Engine', icon: '⚙',
      fields: [
        rng('engineDepth', 'Search depth', 3, 1, 8, 1, 'Search', { live: false }),
        num('engineTimeMs', 'Time limit (0 = off)', 0, 0, 30000, 100, 'Search', { live: false, unit: 'ms' }),
        rng('engineMultipv', 'Lines to show', 5, 1, 8, 1, 'Search', { live: true }),
        t('engineBook', 'Use built-in opening book', true, 'Search', { live: true }),
        rng('engineRandomness', 'Randomness', 0, 0, 100, 1, 'Strength', { live: true, unit: 'cp' }),
        rng('engineBlunderChance', 'Deliberate mistake chance', 0, 0, 50, 1, 'Strength', { live: true, unit: '%' }),
        t('engineContemptDraw', 'Avoid draws (contempt)', false, 'Strength', { live: false, tier: 'advanced' }),
        num('engineContemptValue', 'Contempt value', 0, -100, 100, 5, 'Strength', { live: false, tier: 'advanced' }),
        t('engineShowNodes', 'Show node count', true, 'Diagnostics', { live: true }),
        t('engineShowSpeed', 'Show nodes/second', true, 'Diagnostics', { live: true }),
        t('engineShowTime', 'Show search time', true, 'Diagnostics', { live: true }),
        rng('engineHashSize', 'Transposition table size', 200000, 10000, 1000000, 10000, 'Diagnostics', { live: false, tier: 'advanced' }),
        t('engineAspirationWindows', 'Aspiration windows', true, 'Diagnostics', { live: false, tier: 'lab' }),
        t('engineNullMove', 'Null-move pruning', false, 'Diagnostics', { live: false, tier: 'lab' }),
        t('engineLateMoveReduction', 'Late move reductions', false, 'Diagnostics', { live: false, tier: 'lab' }),

        // evaluation weights — these feed straight into evaluate()
        num('wMatPawn', 'Pawn value', 100, 50, 200, 5, 'Evaluation weights', { live: false, engineWeight: 'p' }),
        num('wMatKnight', 'Knight value', 320, 200, 500, 5, 'Evaluation weights', { live: false, engineWeight: 'n' }),
        num('wMatBishop', 'Bishop value', 330, 200, 500, 5, 'Evaluation weights', { live: false, engineWeight: 'b' }),
        num('wMatRook', 'Rook value', 500, 350, 800, 5, 'Evaluation weights', { live: false, engineWeight: 'r' }),
        num('wMatQueen', 'Queen value', 900, 600, 1400, 5, 'Evaluation weights', { live: false, engineWeight: 'q' }),
        num('wBishopPair', 'Bishop pair', 30, -50, 100, 5, 'Evaluation weights', { live: false }),
        num('wDoubledPawn', 'Doubled pawn', -14, -60, 20, 1, 'Evaluation weights', { live: false }),
        num('wIsolatedPawn', 'Isolated pawn', -16, -60, 20, 1, 'Evaluation weights', { live: false }),
        num('wPassedPawn', 'Passed pawn (mid rank)', 22, -20, 80, 1, 'Evaluation weights', { live: false }),
        num('wRookOpenFile', 'Rook on open file', 18, -20, 60, 1, 'Evaluation weights', { live: false }),
        num('wRookSemiOpen', 'Rook on half-open file', 9, -20, 60, 1, 'Evaluation weights', { live: false }),
        num('wKingShield', 'King pawn shield', 12, -20, 60, 1, 'Evaluation weights', { live: false }),
        num('wTempo', 'Tempo bonus', 6, -30, 40, 1, 'Evaluation weights', { live: false }),
        sel('enginePersonality', 'Personality preset', 'balanced', 'Personality', {
          balanced: 'Balanced', aggressive: 'Aggressive', defensive: 'Defensive',
          positional: 'Positional', materialist: 'Materialist', gambiteer: 'Gambiteer'
        }, { live: false })
      ]
    },

    // ---------------------------------------------------------- Analysis
    {
      id: 'analysis', title: 'Analysis', icon: '📈',
      fields: [
        t('showBestArrow', 'Best-move arrow', true, 'Display', { live: true }),
        sel('arrowStyle', 'Arrow style', 'thick', 'Display', { thin: 'Thin', thick: 'Thick', dotted: 'Dotted' }, { live: true, tier: 'advanced' }),
        sel('arrowColor', 'Arrow colour', 'green', 'Display', {
          green: 'Green', blue: 'Blue', amber: 'Amber', purple: 'Purple', auto: 'Best=green, second=blue'
        }, { live: true, tier: 'advanced' }),
        rng('arrowOpacity', 'Arrow opacity', 85, 20, 100, 5, 'Display', { live: true, tier: 'advanced', unit: '%' }),
        t('showTopArrows', 'Arrows for top 3 moves', false, 'Display', { live: true, tier: 'advanced' }),
        t('showPvLine', 'Show principal variation', true, 'Display', { live: true }),
        rng('pvLength', 'PV length', 5, 1, 12, 1, 'Display', { live: true, tier: 'advanced' }),
        t('showAdvantageBadge', 'Show who stands better', true, 'Display', { live: true }),
        t('showFenBox', 'Show FEN box', true, 'Display', { live: true }),
        t('autoAnalyzeOnMove', 'Analyze automatically after each move', false, 'Behaviour', { live: true }),
        rng('autoAnalyzeDepth', 'Auto-analyze depth', 2, 1, 5, 1, 'Behaviour', { live: true, tier: 'advanced' }),
        t('stopOnMate', 'Stop searching when mate found', true, 'Behaviour', { live: true, tier: 'advanced' }),
        sel('evalCurveType', 'Eval graph smoothing', 'linear', 'Behaviour', {
          linear: 'Linear', smooth: 'Smoothed', staircase: 'Staircase'
        }, { live: true, tier: 'advanced' })
      ]
    },

    // ------------------------------------------------------------ Review
    {
      id: 'review', title: 'Review', icon: '🔍',
      fields: [
        rng('reviewDepth', 'Review depth', 2, 1, 5, 1, 'Accuracy', { live: false }),
        num('reviewTimePerMove', 'Time per move (0 = depth only)', 0, 0, 3000, 50, 'Accuracy', { live: false, unit: 'ms' }),
        num('blunderCp', 'Blunder threshold', 150, 80, 400, 10, 'Classification', { live: true, unit: 'cp' }),
        num('mistakeCp', 'Mistake threshold', 70, 30, 200, 5, 'Classification', { live: true, unit: 'cp' }),
        num('inaccuracyCp', 'Inaccuracy threshold', 30, 10, 100, 5, 'Classification', { live: true, unit: 'cp' }),
        t('showBestInsteadOfPlayed', 'Show the better move on hover', true, 'Classification', { live: true }),
        t('markGreatMoves', 'Mark great moves', true, 'Classification', { live: true }),
        t('markBookMoves', 'Mark opening-book moves', true, 'Classification', { live: true }),
        t('showAccuracyGraph', 'Accuracy graph', true, 'Display', { live: true }),
        t('showAccuracyPerSide', 'Per-side accuracy', true, 'Display', { live: true }),
        t('showReviewSummary', 'Summary card', true, 'Display', { live: true }),
        sel('accuracyModel', 'Accuracy model', 'winprob', 'Accuracy', {
          winprob: 'Win-probability (Lichess-style)', linear: 'Linear centipawn', raw: 'Raw percentage'
        }, { live: false }),
        t('jumpToNextBlunder', 'Keyboard jumps to next blunder', true, 'Behaviour', { live: true }),
        num('maxReviewPlies', 'Max plies to review', 200, 20, 500, 10, 'Behaviour', { live: false }),
        t('autoReviewOnImport', 'Auto-review imported games', false, 'Behaviour', { live: true })
      ]
    },

    // ------------------------------------------------------------- Coach
    {
      id: 'coach', title: 'Coach', icon: '🤖',
      fields: [
        sel('provider', 'Provider', 'openai', 'Model', {
          openai: 'OpenAI', anthropic: 'Anthropic', custom: 'Custom (OpenAI-compatible)',
          ollama: 'Ollama (local)', lmstudio: 'LM Studio (local)'
        }, { live: true }),
        txt('model', 'Model', 'gpt-4o-mini', 'Model', { live: true, placeholder: 'gpt-4o-mini' }),
        txt('baseUrl', 'Base URL', '', 'Model', { live: true, placeholder: 'https://api.openai.com/v1' }),
        { id: 'apiKey', label: 'API key', type: 'password', default: '', group: 'Model', tier: 'core',
          live: true, help: 'Stored only in this browser. Never leaves it except to your provider.' },
        t('sessionOnlyKey', 'Forget key when the tab closes', false, 'Model', { live: true, tier: 'advanced' }),
        txt('fallbackModel', 'Fallback model', '', 'Model', { live: true, tier: 'advanced', placeholder: 'used if the primary fails' }),

        rng('temperature', 'Temperature', 0.7, 0, 2, 0.05, 'Sampling', { live: true }),
        rng('topP', 'Top-p', 1, 0.1, 1, 0.05, 'Sampling', { live: true, tier: 'advanced' }),
        num('maxTokens', 'Max response tokens', 900, 100, 8000, 50, 'Sampling', { live: true, tier: 'advanced' }),
        rng('presencePenalty', 'Presence penalty', 0, -2, 2, 0.1, 'Sampling', { live: true, tier: 'advanced' }),
        rng('frequencyPenalty', 'Frequency penalty', 0, -2, 2, 0.1, 'Sampling', { live: true, tier: 'advanced' }),
        num('seed', 'Seed (0 = random)', 0, 0, 999999, 1, 'Sampling', { live: true, tier: 'lab' }),
        t('streamResponses', 'Stream responses', true, 'Sampling', { live: true, tier: 'advanced' }),

        sel('persona', 'Coaching style', 'intermediate', 'Prompt', {
          beginner: 'Beginner-friendly', intermediate: 'Club player', advanced: 'Tournament',
          kid: 'For a child', ruthless: 'Blunt', custom: 'Custom prompt'
        }, { live: true }),
        { id: 'systemPrompt', label: 'System prompt', type: 'textarea', default: PERSONAS.intermediate,
          group: 'Prompt', tier: 'core', live: true, rows: 4 },
        sel('language', 'Response language', 'en', 'Prompt', {
          en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português',
          ru: 'Русский', zh: '中文', ja: '日本語', hi: 'हिन्दी', ar: 'العربية'
        }, { live: true }),
        sel('verbosity', 'Answer length', 'normal', 'Prompt', {
          terse: 'Terse (1–3 sentences)', normal: 'Normal', detailed: 'Detailed', essay: 'Deep dive'
        }, { live: true }),
        t('includeEngineEval', 'Send engine evaluation with the question', true, 'Context', { live: true }),
        t('includeEngineLines', 'Send top engine moves', true, 'Context', { live: true }),
        rng('contextMoves', 'Moves of history to include', 40, 0, 200, 5, 'Context', { live: true, tier: 'advanced' }),
        t('includeFen', 'Send the FEN', true, 'Context', { live: true, tier: 'advanced' }),
        t('includeReviewMarks', 'Send my blunders from this game', true, 'Context', { live: true, tier: 'advanced' }),
        t('rememberChat', 'Remember the conversation', true, 'Context', { live: true }),
        rng('chatMemoryTurns', 'Conversation turns to keep', 6, 0, 30, 1, 'Context', { live: true, tier: 'advanced' }),
        t('askForPgnOnEmpty', 'Coach asks for a PGN if none loaded', true, 'Behaviour', { live: true, tier: 'advanced' })
      ]
    },

    // ------------------------------------------------------------ Import
    {
      id: 'import', title: 'Chess.com', icon: '📥',
      fields: [
        txt('chesscomUser', 'Your Chess.com username', '', 'Source', { live: true, placeholder: 'username' }),
        num('importMaxGames', 'Games to fetch per month', 20, 1, 200, 1, 'Source', { live: true }),
        sel('importTimeClass', 'Time class', 'all', 'Filter', {
          all: 'All', rapid: 'Rapid', blitz: 'Blitz', bullet: 'Bullet', daily: 'Daily'
        }, { live: true }),
        t('importRatedOnly', 'Rated games only', false, 'Filter', { live: true }),
        t('importWinsOnly', 'Only games I won', false, 'Filter', { live: true, tier: 'advanced' }),
        t('importMyColourOnly', 'Only games where I had a given colour', false, 'Filter', { live: true, tier: 'lab' }),
        t('importCache', 'Cache archives locally', true, 'Behaviour', { live: true }),
        num('importCacheMinutes', 'Cache lifetime', 60, 1, 1440, 1, 'Behaviour', { live: true, tier: 'advanced', unit: 'min' }),
        t('importAutoLoadLatest', 'Auto-load my latest game on open', false, 'Behaviour', { live: true }),
        t('showAccuracies', 'Show Chess.com accuracy if provided', true, 'Behaviour', { live: true, tier: 'advanced' }),
        t('compareAccuracy', 'Compare my review to Chess.com accuracy', true, 'Behaviour', { live: true, tier: 'advanced' })
      ]
    },

    // ---------------------------------------------------------------- App
    {
      id: 'app', title: 'Interface', icon: '🎨',
      fields: [
        sel('appTheme', 'App theme', 'dark', 'Theme', { dark: 'Dark', light: 'Light', midnight: 'Midnight', sepia: 'Sepia' }, { live: true }),
        sel('accent', 'Accent colour', 'green', 'Theme', {
          green: 'Green', blue: 'Blue', purple: 'Purple', amber: 'Amber', rose: 'Rose'
        }, { live: true }),
        rng('fontScale', 'Text size', 100, 80, 150, 5, 'Theme', { live: true, unit: '%' }),
        sel('density', 'Layout density', 'comfortable', 'Theme', {
          compact: 'Compact', comfortable: 'Comfortable', spacious: 'Spacious'
        }, { live: true }),
        sel('tabLayout', 'Tab position', 'top', 'Theme', { top: 'Top', left: 'Left rail' }, { live: true, tier: 'advanced' }),
        t('showMoveList', 'Move list panel', true, 'Panels', { live: true }),
        t('showOpeningName', 'Opening name', true, 'Panels', { live: true }),
        t('showReviewPanel', 'Review panel', true, 'Panels', { live: true }),
        t('stickyBoard', 'Pin board while scrolling', true, 'Panels', { live: true, tier: 'advanced' }),
        t('wordWrapPgn', 'Wrap long PGN lines', true, 'Panels', { live: true, tier: 'advanced' }),
        t('showStatusBar', 'Status bar', true, 'Panels', { live: true, tier: 'advanced' }),
        t('confirmDestructive', 'Confirm destructive actions', true, 'Behaviour', { live: true }),
        t('keyboardShortcuts', 'Keyboard shortcuts', true, 'Behaviour', { live: true }),
        t('toastNotifications', 'Toast notifications', true, 'Behaviour', { live: true, tier: 'advanced' }),
        rng('toastMs', 'Toast duration', 2500, 800, 8000, 100, 'Behaviour', { live: true, tier: 'advanced', unit: 'ms' })
      ]
    },

    // -------------------------------------------------------- Accessibility
    {
      id: 'a11y', title: 'Accessibility', icon: '♿',
      fields: [
        t('reduceMotion', 'Reduce motion', false, 'Motion', { live: true }),
        t('highContrast', 'High contrast mode', false, 'Contrast', { live: true }),
        t('colorblindSafe', 'Colourblind-safe board', false, 'Contrast', { live: true }),
        t('largeClickTargets', 'Larger click targets', false, 'Input', { live: true }),
        t('focusRings', 'Visible focus rings', true, 'Input', { live: true }),
        t('screenReaderLabels', 'Screen-reader move announcements', true, 'Screen reader', { live: true }),
        t('verboseAnnounce', 'Verbose announcements', false, 'Screen reader', { live: true, tier: 'advanced' }),
        sel('fontFamily', 'Font', 'system', 'Typography', {
          system: 'System UI', serif: 'Serif', mono: 'Monospace', dyslexic: 'Dyslexia-friendly'
        }, { live: true })
      ]
    },

    // ------------------------------------------------------------ Fair play
    {
      id: 'fairplay', title: 'Fair play', icon: '🛡',
      fields: [
        t('fairPlayGuard', 'Guard against live games', true, 'Guard', { live: true, locked: true,
          help: 'Fails closed: disables analysis while a live board is open. Keep this on.' }),
        t('warnOnLiveTab', 'Warn when a live game tab is open', true, 'Guard', { live: true }),
        sel('guardScope', 'What counts as live', 'strict', 'Guard', {
          strict: 'Live games + analysis board', live: 'Live games only'
        }, { live: true, tier: 'advanced' }),
        t('studyModeBanner', 'Show the study-only banner', true, 'Guard', { live: true }),
        { id: 'ackFairPlay', label: 'I have read Chess.com’s fair play rules', type: 'toggle', default: false,
          group: 'Guard', tier: 'core', live: true }
      ]
    },

    // --------------------------------------------------------------- Data
    {
      id: 'data', title: 'Data', icon: '💾',
      fields: [
        { id: 'exportSettings', label: 'Export settings to JSON', type: 'button', default: null, group: 'Backup', tier: 'core', action: 'exportSettings' },
        { id: 'importSettings', label: 'Import settings from JSON', type: 'button', default: null, group: 'Backup', tier: 'core', action: 'importSettings' },
        { id: 'resetSettings', label: 'Reset everything to defaults', type: 'button', default: null, group: 'Backup', tier: 'core', action: 'resetSettings', danger: true },
        { id: 'clearCache', label: 'Clear imported-game cache', type: 'button', default: null, group: 'Storage', tier: 'advanced', action: 'clearCache' },
        t('persistSession', 'Remember board and game between visits', true, 'Storage', { live: true }),
        t('analytics', 'Anonymous usage stats (never sent anywhere)', false, 'Privacy', { live: true, locked: true,
          help: 'There is no analytics backend. This toggle exists so the answer is on the record: nothing is collected.' })
      ]
    }
  ];

  // ------------------------------------------------------------- helpers
  var byId = {};
  sections.forEach(function (s) {
    s.fields.forEach(function (f) { f.section = s.id; byId[f.id] = f; });
  });

  function defaults() {
    var o = {};
    sections.forEach(function (s) {
      s.fields.forEach(function (f) {
        if (f.type === 'button') return;
        o[f.id] = f.default;
      });
    });
    return o;
  }

  function coerce(field, value) {
    if (!field) return value;
    switch (field.type) {
      case 'toggle': return !!value;
      case 'range':
      case 'number': {
        var n = typeof value === 'number' ? value : parseFloat(value);
        if (isNaN(n)) n = field.default;
        if (field.min != null && n < field.min) n = field.min;
        if (field.max != null && n > field.max) n = field.max;
        return n;
      }
      case 'select':
        return field.options && Object.prototype.hasOwnProperty.call(field.options, value) ? value : field.default;
      default: return value == null ? field.default : String(value);
    }
  }

  // Merge stored values over defaults, dropping unknown / invalid keys.
  function normalise(stored) {
    var out = defaults();
    if (!stored || typeof stored !== 'object') return out;
    Object.keys(out).forEach(function (id) {
      if (Object.prototype.hasOwnProperty.call(stored, id)) out[id] = coerce(byId[id], stored[id]);
    });
    return out;
  }

  // Settings that map onto engine evaluation weights.
  function engineWeights(s) {
    var w = {
      bishopPair: s.wBishopPair, doubledPawn: s.wDoubledPawn, isolatedPawn: s.wIsolatedPawn,
      rookOpenFile: s.wRookOpenFile, rookSemiOpen: s.wRookSemiOpen,
      kingShield: s.wKingShield, tempo: s.wTempo, contempt: s.engineContemptDraw ? s.engineContemptValue : 0
    };
    // passed-pawn curve scaled from the single mid-rank number
    var base = s.wPassedPawn;
    w.passedPawn = [0, base * 0.3, base * 0.55, base, base * 1.7, base * 2.7, base * 4, 0].map(Math.round);
    return w;
  }

  function pieceValues(s) {
    return { p: s.wMatPawn, n: s.wMatKnight, b: s.wMatBishop, r: s.wMatRook, q: s.wMatQueen, k: 20000 };
  }

  var PRESETS = {
    beginner: { engineDepth: 2, engineBook: true, showBestArrow: true, persona: 'beginner', verbosity: 'detailed', boardTheme: 'green', blunderCp: 200, mistakeCp: 100 },
    club: { engineDepth: 3, engineMultipv: 4, persona: 'intermediate', reviewDepth: 2, boardTheme: 'brown' },
    tournament: { engineDepth: 5, engineMultipv: 3, persona: 'advanced', verbosity: 'terse', reviewDepth: 3, boardTheme: 'slate', coordinates: true },
    streamer: { engineDepth: 4, boardTheme: 'walnut', pieceSet: 'solid', sounds: true, showTopArrows: true, appTheme: 'midnight' },
    lowspec: { engineDepth: 2, engineMultipv: 2, animateMoves: false, showTopArrows: false, reviewDepth: 1, autoReviewOnImport: false },
    accessible: { highContrast: true, colorblindSafe: true, reduceMotion: true, largeClickTargets: true, fontScale: 120, boardTheme: 'colorblind' }
  };

  var api = {
    sections: sections, byId: byId, defaults: defaults, normalise: normalise, coerce: coerce,
    engineWeights: engineWeights, pieceValues: pieceValues,
    themes: BOARD_THEMES, pieceSets: PIECE_SETS, personas: PERSONAS, presets: PRESETS,
    count: sections.reduce(function (n, s) { return n + s.fields.filter(function (f) { return f.type !== 'button'; }).length; }, 0)
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChessCoachSettings = api;
})(typeof window !== 'undefined' ? window : globalThis);
