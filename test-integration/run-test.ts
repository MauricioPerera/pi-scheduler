import { SchedulerAgent } from './scheduler-agent.js';

async function main(): Promise<void> {
  const model = process.env.OLLAMA_MODEL || 'kimi-k2.6:cloud';
  const agent = new SchedulerAgent(model);

  try {
    await agent.init();

    // Test 1: Simple task
    console.log('\n========================================');
    console.log('TEST 1: Run a simple shell command');
    console.log('========================================');
    await agent.askAndExecute(
      `Please run a task named ollama_echo_test that executes "echo Hello from Ollama scheduler test" with cwd C:/temp. Respond ONLY with valid JSON.`
    );

    await agent.showStatus();

    // Test 2: Script task
    console.log('\n========================================');
    console.log('TEST 2: Run a JavaScript script');
    console.log('========================================');
    await agent.askAndExecute(
      `Please run a JavaScript task named print-datetime that runs console.log(new Date().toISOString()) with cwd C:/temp. Respond ONLY with valid JSON.`
    );

    await agent.showStatus();

    // Test 3: Create automation
    console.log('\n========================================');
    console.log('TEST 3: Create a recurring automation');
    console.log('========================================');
    await agent.askAndExecute(
      `Please create a recurring automation named Heartbeat that runs every 1 minute and executes "echo heartbeat" with cwd C:/temp. Use command type. Respond ONLY with valid JSON.`
    );

    // Wait for automation to tick
    console.log('\n[Agent] Waiting 7 seconds for automation tick...');
    await sleep(7000);

    await agent.showStatus();

    // Test 4: Check notifications
    console.log('\n========================================');
    console.log('TEST 4: Check notifications');
    console.log('========================================');
    const notifications = agent['scheduler'].checkNotifications();
    console.log(`Pending notifications: ${notifications.length}`);
    for (const n of notifications.slice(0, 3)) {
      console.log(`  - ${n.type}: ${n.automationName || n.taskName} at ${new Date(n.timestamp).toISOString()}`);
    }

  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await agent.shutdown();
    agent.cleanup();
    console.log('\n[Agent] All tests completed.');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();

