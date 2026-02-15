require("dotenv").config({ path: require("path").join(__dirname, ".env") });

// const fetch = require('node-fetch'); // Using native Node.js fetch (Node 18+)

const ACCOUNT = process.env.SNOWFLAKE_ACCOUNT_IDENTIFIER;
const PAT = process.env.SNOWFLAKE_PAT;

console.log("--- Snowflake Connection Test ---");
console.log(`Account: '${ACCOUNT}'`);
console.log(`PAT Length: ${PAT ? PAT.length : 'MISSING'}`);

if (!ACCOUNT || !PAT) {
    console.error("❌ Missing credentials in .env");
    process.exit(1);
}

const ACC_ID = ACCOUNT.replace(/\/$/, '');
const BASE_URL = `https://${ACC_ID}.snowflakecomputing.com`;
const API_URL = `${BASE_URL}/api/v2/statements`;

console.log(`Testing URL: ${API_URL}`);

async function testConnection() {
    try {
        // Try the modern function name 'COMPLETE' and a smaller model
        console.log("Attempting SNOWFLAKE.CORTEX.COMPLETE with gemma-7b...");
        const body = {
            statement: "SELECT SNOWFLAKE.CORTEX.COMPLETE('gemma-7b', 'Hello')",
            warehouse: "COMPUTE_WH",
            role: "ACCOUNTADMIN"
        };

        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PAT}`,
                'Accept': 'application/json',
                'User-Agent': 'arena-chat-test/1.0'
            },
            body: JSON.stringify(body)
        });

        console.log(`HTTP Status: ${res.status} ${res.statusText}`);

        const text = await res.text();
        console.log("Response Body Preview:", text.substring(0, 500));

        if (res.ok) {
            console.log("✅ Connection SUCCESSFUL!");
        } else {
            console.log("❌ Connection FAILED.");
            if (res.status === 404) {
                console.log("👉 Suggestion: Check SNOWFLAKE_ACCOUNT_IDENTIFIER. It might need a region (e.g. xy12345.us-east-1).");
            }
            if (res.status === 401 || res.status === 403) {
                console.log("👉 Suggestion: Check SNOWFLAKE_PAT. It might be invalid or expired.");
            }
        }

    } catch (e) {
        console.error("❌ Network/Script Error:", e.message);
    }
}

testConnection();
