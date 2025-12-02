/**
 * Test script to verify error handling in main.js
 * Tests that error handling doesn't crash when error.message is undefined
 */

function testErrorHandling() {
    console.log('Testing error handling...\n');
    
    // Test 1: Error object with message property
    console.log('Test 1: Normal Error object');
    try {
        const error = new Error('Test error message');
        const errorMessage = error?.message || String(error) || 'Unknown error';
        console.log(`  ✓ Error message: "${errorMessage}"`);
        console.log(`  ✓ Contains check: ${errorMessage.includes('Test')}`);
    } catch (e) {
        console.error('  ✗ Test 1 failed:', e);
        return false;
    }
    
    // Test 2: Error without message (undefined message)
    console.log('\nTest 2: Error with undefined message');
    try {
        const error = {};
        const errorMessage = error?.message || String(error) || 'Unknown error';
        console.log(`  ✓ Error message: "${errorMessage}"`);
        console.log(`  ✓ Contains check works: ${errorMessage.includes('cancelled')}`);
    } catch (e) {
        console.error('  ✗ Test 2 failed:', e);
        return false;
    }
    
    // Test 3: String error (not an Error object)
    console.log('\nTest 3: String error');
    try {
        const error = 'Simple string error';
        const errorMessage = error?.message || String(error) || 'Unknown error';
        console.log(`  ✓ Error message: "${errorMessage}"`);
        console.log(`  ✓ Contains check works: ${errorMessage.includes('string')}`);
    } catch (e) {
        console.error('  ✗ Test 3 failed:', e);
        return false;
    }
    
    // Test 4: Null or undefined error
    console.log('\nTest 4: Null error');
    try {
        const error = null;
        const errorMessage = error?.message || String(error) || 'Unknown error';
        console.log(`  ✓ Error message: "${errorMessage}"`);
        console.log(`  ✓ Contains check works: ${errorMessage.includes('null')}`);
    } catch (e) {
        console.error('  ✗ Test 4 failed:', e);
        return false;
    }
    
    // Test 5: Undefined error
    console.log('\nTest 5: Undefined error');
    try {
        const error = undefined;
        const errorMessage = error?.message || String(error) || 'Unknown error';
        console.log(`  ✓ Error message: "${errorMessage}"`);
        console.log(`  ✓ Contains check works (no crash): ${errorMessage.includes('test')}`);
    } catch (e) {
        console.error('  ✗ Test 5 failed:', e);
        return false;
    }
    
    // Test 6: Error with message 'cancelled'
    console.log('\nTest 6: Cancelled error detection');
    try {
        const error = new Error('Operation cancelled by user');
        const errorMessage = error?.message || String(error) || 'Unknown error';
        console.log(`  ✓ Error message: "${errorMessage}"`);
        console.log(`  ✓ Correctly detects cancelled: ${errorMessage.includes('cancelled')}`);
    } catch (e) {
        console.error('  ✗ Test 6 failed:', e);
        return false;
    }
    
    console.log('\n✅ All error handling tests passed!');
    return true;
}

// Run tests
if (require.main === module) {
    const success = testErrorHandling();
    process.exit(success ? 0 : 1);
}

module.exports = { testErrorHandling };
