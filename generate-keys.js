const crypto = require('crypto');
const fs = require('fs');

// Generate RSA 2048 key pair
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
    },
    privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
    }
});

fs.writeFileSync('rsa_key.p8', privateKey);
fs.writeFileSync('rsa_key.pub', publicKey);

console.log('✅ Keys generated successfully!');
console.log('-------------------------------------------------------');
console.log('1. Private Key saved to: rsa_key.p8');
console.log('2. Public Key saved to:  rsa_key.pub');
console.log('-------------------------------------------------------');
console.log('👉 NEXT STEPS:');
console.log('1. Open "rsa_key.pub" and copy the content (keeping only the base64 part, remove header/footer if using ALTER USER ... SET RSA_PUBLIC_KEY=\'...\').');
console.log('   Actually, for Snowflake SQL, you need just the base64 content between the lines.');
console.log('2. Run this SQL in Snowflake:');
console.log(`   ALTER USER "<your_username>" SET RSA_PUBLIC_KEY='<paste_public_key_content_here>';`);
console.log('3. Update your .env file with the absolute path to "rsa_key.p8".');
