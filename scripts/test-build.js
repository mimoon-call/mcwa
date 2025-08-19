#!/usr/bin/env node

const esbuild = require('esbuild');

async function testEsbuild() {
  try {
    console.log('Testing esbuild availability...');
    
    // Test basic esbuild functionality
    const result = await esbuild.transform('console.log("Hello World");', {
      minify: true,
      target: 'es2020',
    });
    
    console.log('esbuild is working correctly!');
    console.log('Transformed code:', result.code);
    
    return true;
  } catch (error) {
    console.error('esbuild test failed:', error);
    return false;
  }
}

testEsbuild().then(success => {
  if (!success) {
    process.exit(1);
  }
});
