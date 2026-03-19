// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Bug Fix Verification Tests
 * 
 * Bugs Fixed:
 * 1. Players stayed in lobby after host started game
 * 2. Players couldn't interact during game
 */

test.describe('Bug Fix Verification - Game Start Flow', () => {
  test('Host and Client can play game after start', async ({ browser }) => {
    const results = {
      host: {
        roomCreated: false,
        seesJoiningPlayers: false,
        canStartGame: false,
        seesOwnRole: false,
        transitionsToGameScreen: false,
        canInteract: false,
      },
      client: {
        canJoinRoom: false,
        hostSeesPlayer: false,
        receivesRoleAssignment: false,
        transitionsToGameScreen: false,
        seesPhaseIndicator: false,
        seesPlayersGrid: false,
        canInteract: false,
      },
      console: {
        noErrors: true,
        roleAssignmentLogged: false,
        gameStateUpdateLogged: false,
      }
    };

    const hostContext = await browser.newContext();
    const clientContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    const clientPage = await clientContext.newPage();

    const hostConsoleLogs = [];
    const clientConsoleLogs = [];
    const hostErrors = [];
    const clientErrors = [];

    hostPage.on('console', msg => {
      hostConsoleLogs.push(msg.text());
      if (msg.type() === 'error') hostErrors.push(msg.text());
    });
    clientPage.on('console', msg => {
      clientConsoleLogs.push(msg.text());
      if (msg.type() === 'error') clientErrors.push(msg.text());
    });

    try {
      // =====================
      // HOST SETUP
      // =====================
      console.log('📝 HOST: Opening game...');
      await hostPage.goto('/');
      await hostPage.waitForLoadState('networkidle');

      console.log('📝 HOST: Entering name and creating room...');
      await hostPage.locator('#host-name').fill('Host');
      await hostPage.locator('button:has-text("Tạo Phòng")').click();

      console.log('📝 HOST: Waiting for room code...');
      await hostPage.locator('.room-code').waitFor({ state: 'visible', timeout: 15000 });
      const roomCodeText = await hostPage.locator('.room-code').textContent();
      const roomCode = roomCodeText.replace('WW-', '').trim();
      console.log(`📝 HOST: Room code: WW-${roomCode}`);
      results.host.roomCreated = roomCode.length > 0;

      // =====================
      // CLIENT SETUP
      // =====================
      console.log('📝 CLIENT: Opening game...');
      await clientPage.goto('/');
      await clientPage.waitForLoadState('networkidle');

      console.log('📝 CLIENT: Entering room code and name...');
      await clientPage.locator('#room-code-input').fill(`WW-${roomCode}`);
      await clientPage.locator('#player-name').fill('Player2');
      await clientPage.locator('button:has-text("Vào Phòng")').click();

      console.log('📝 CLIENT: Waiting to join room...');
      await clientPage.locator('#room-section').waitFor({ state: 'visible', timeout: 10000 });
      results.client.canJoinRoom = true;

      // Wait for connection to establish
      await hostPage.waitForTimeout(5000);

      // =====================
      // VERIFY PLAYER JOIN
      // =====================
      console.log('📝 HOST: Checking player list...');
      const hostPlayerItems = hostPage.locator('.player-item');
      const playerCount = await hostPlayerItems.count();
      console.log(`📝 HOST: Player count: ${playerCount}`);
      
      let playerListText = '';
      if (playerCount > 0) {
        playerListText = await hostPage.locator('.player-list').textContent();
        console.log(`📝 HOST: Player list: ${playerListText.substring(0, 200)}`);
      }
      
      results.host.seesJoiningPlayers = playerCount >= 2 || playerListText.includes('Player2');
      results.client.hostSeesPlayer = results.host.seesJoiningPlayers;

      // Wait more for synchronization
      await hostPage.waitForTimeout(3000);

      // =====================
      // START GAME
      // =====================
      console.log('📝 HOST: Starting game...');
      const startBtn = hostPage.locator('#start-game-btn');
      const startBtnEnabled = await startBtn.isEnabled().catch(() => false);
      console.log(`📝 HOST: Start button enabled: ${startBtnEnabled}`);
      results.host.canStartGame = startBtnEnabled;
      
      if (startBtnEnabled) {
        await startBtn.click();
      }

      // Wait for game to start
      await hostPage.waitForTimeout(5000);

      // =====================
      // VERIFY GAME STATE - HOST
      // =====================
      console.log('📝 HOST: Verifying game state...');
      
      // Check if game section is visible
      const hostGameSection = hostPage.locator('#game-section');
      const hostGameVisible = await hostGameSection.isVisible().catch(() => false);
      
      // Check if room section is hidden
      const hostRoomClasses = await hostPage.locator('#room-section').getAttribute('class').catch(() => '');
      const hostRoomHidden = hostRoomClasses?.includes('hidden') || !await hostPage.locator('#room-section').isVisible().catch(() => true);
      
      results.host.transitionsToGameScreen = hostGameVisible && hostRoomHidden;
      console.log(`📝 HOST: Game visible=${hostGameVisible}, Room hidden=${hostRoomHidden}`);

      // Check role
      const hostRoleElement = hostPage.locator('.role-card, .my-role').first();
      const hostRoleText = await hostRoleElement.textContent().catch(() => '');
      results.host.seesOwnRole = hostRoleText.length > 5 && 
        (hostRoleText.includes('🐺') || hostRoleText.includes('Sói') || 
         hostRoleText.includes('Dân') || hostRoleText.includes('Tiên') ||
         hostRoleText.includes('Thợ'));
      console.log(`📝 HOST: Role: ${hostRoleText.substring(0, 50)}`);

      // Check phase indicator
      const hostPhaseText = await hostPage.locator('#phase-display, .phase-indicator').textContent().catch(() => '');
      const hasPhaseIndicator = hostPhaseText?.includes('Đêm') || hostPhaseText?.includes('🌙');
      
      // Check action buttons
      const hostActionText = await hostPage.locator('#action-buttons').textContent().catch(() => '');
      const hasActionButtons = hostActionText?.length > 10;
      
      results.host.canInteract = hasPhaseIndicator && hasActionButtons;
      console.log(`📝 HOST: Phase="${hostPhaseText?.substring(0, 30)}", Actions="${hostActionText?.substring(0, 50)}"`);

      // =====================
      // VERIFY GAME STATE - CLIENT
      // =====================
      console.log('📝 CLIENT: Verifying game state...');
      await clientPage.waitForTimeout(3000);

      const clientGameSection = clientPage.locator('#game-section');
      const clientGameVisible = await clientGameSection.isVisible().catch(() => false);
      const clientRoomClasses = await clientPage.locator('#room-section').getAttribute('class').catch(() => '');
      const clientRoomHidden = clientRoomClasses?.includes('hidden') || !await clientPage.locator('#room-section').isVisible().catch(() => true);
      
      results.client.transitionsToGameScreen = clientGameVisible && clientRoomHidden;
      console.log(`📝 CLIENT: Game visible=${clientGameVisible}, Room hidden=${clientRoomHidden}`);

      const clientRoleElement = clientPage.locator('.role-card, .my-role').first();
      const clientRoleText = await clientRoleElement.textContent().catch(() => '');
      results.client.receivesRoleAssignment = clientRoleText.length > 5 &&
        (clientRoleText.includes('🐺') || clientRoleText.includes('Sói') ||
         clientRoleText.includes('Dân') || clientRoleText.includes('Tiên') ||
         clientRoleText.includes('Thợ'));
      console.log(`📝 CLIENT: Role: ${clientRoleText.substring(0, 50)}`);

      const clientPhaseText = await clientPage.locator('#phase-display, .phase-indicator').textContent().catch(() => '');
      results.client.seesPhaseIndicator = clientPhaseText?.includes('Đêm') || clientPhaseText?.includes('🌙');
      
      results.client.seesPlayersGrid = await clientPage.locator('.role-cards, .players-grid').isVisible().catch(() => false);
      
      const clientActionText = await clientPage.locator('#action-buttons').textContent().catch(() => '');
      results.client.canInteract = results.client.seesPhaseIndicator && clientActionText?.length > 10;
      
      console.log(`📝 CLIENT: Phase="${clientPhaseText?.substring(0, 30)}", Actions="${clientActionText?.substring(0, 50)}"`);

      // =====================
      // CONSOLE CHECKS
      // =====================
      const allLogs = [...hostConsoleLogs, ...clientConsoleLogs];
      results.console.roleAssignmentLogged = allLogs.some(log => 
        log.toLowerCase().includes('role') || log.toLowerCase().includes('sending')
      );
      results.console.gameStateUpdateLogged = allLogs.some(log =>
        log.toLowerCase().includes('game state') || log.toLowerCase().includes('playing') ||
        log.toLowerCase().includes('updategameui')
      );
      results.console.noErrors = hostErrors.length === 0 && clientErrors.length === 0;
      
      console.log('📝 Console logs:', allLogs.length, 'total,', hostErrors.length, 'host errors,', clientErrors.length, 'client errors');

    } catch (error) {
      console.error('❌ Test error:', error.message);
      results.console.noErrors = false;
    } finally {
      await hostContext.close();
      await clientContext.close();
    }

    // =====================
    // REPORT
    // =====================
    console.log('\n' + '='.repeat(60));
    console.log('BUG FIX VERIFICATION RESULTS');
    console.log('='.repeat(60));
    
    console.log('\n### Tab 1 (Host)');
    console.log(`- [${results.host.roomCreated ? 'x' : ' '}] Room created successfully`);
    console.log(`- [${results.host.seesJoiningPlayers ? 'x' : ' '}] Sees joining players in real-time`);
    console.log(`- [${results.host.canStartGame ? 'x' : ' '}] Can start game`);
    console.log(`- [${results.host.seesOwnRole ? 'x' : ' '}] Sees own role`);
    console.log(`- [${results.host.transitionsToGameScreen ? 'x' : ' '}] Transitions to game screen`);
    console.log(`- [${results.host.canInteract ? 'x' : ' '}] Can interact (select player, submit action)`);

    console.log('\n### Tab 2 (Client)');
    console.log(`- [${results.client.canJoinRoom ? 'x' : ' '}] Can join room`);
    console.log(`- [${results.client.hostSeesPlayer ? 'x' : ' '}] Host sees player (verified)`);
    console.log(`- [${results.client.receivesRoleAssignment ? 'x' : ' '}] Receives role assignment`);
    console.log(`- [${results.client.transitionsToGameScreen ? 'x' : ' '}] Transitions to game screen AFTER host starts`);
    console.log(`- [${results.client.seesPhaseIndicator ? 'x' : ' '}] Sees phase indicator`);
    console.log(`- [${results.client.seesPlayersGrid ? 'x' : ' '}] Sees players grid`);
    console.log(`- [${results.client.canInteract ? 'x' : ' '}] Can interact during night/day`);

    console.log('\n### Console Logs');
    console.log(`- [${results.console.noErrors ? 'x' : ' '}] No errors`);
    console.log(`- [${results.console.roleAssignmentLogged ? 'x' : ' '}] Role assignment logged`);
    console.log(`- [${results.console.gameStateUpdateLogged ? 'x' : ' '}] Game state update logged`);

    const hostPass = Object.values(results.host).every(v => v === true);
    const clientPass = Object.values(results.client).every(v => v === true);
    const consolePass = Object.values(results.console).every(v => v === true);
    const overallPass = hostPass && clientPass && consolePass;

    console.log('\n### Verdict');
    console.log(`${overallPass ? '✅ PASS' : '❌ FAIL'} - ${
      overallPass ? 'All bug fixes verified successfully' : 
      `Host: ${hostPass ? '✓' : '✗'}, Client: ${clientPass ? '✓' : '✗'}, Console: ${consolePass ? '✓' : '✗'}`
    }`);
    console.log('='.repeat(60) + '\n');

    expect(overallPass, `Bug fixes verification failed. Host: ${JSON.stringify(results.host)}, Client: ${JSON.stringify(results.client)}`).toBe(true);
  });
});
