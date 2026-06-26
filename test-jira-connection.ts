import dotenv from "dotenv";

dotenv.config();

// Your credentials
const instanceUrl = "https://amla.atlassian.net";
const email = "grecy.bais@amla.io";
const apiToken = process.argv[2]; // Pass token as argument for security

async function testConnection() {
  if (!apiToken) {
    console.error("Please provide API token as argument: tsx test-jira-connection.ts <token>");
    process.exit(1);
  }

  console.log("🔍 Testing Jira Connection...");
  console.log(`URL: ${instanceUrl}`);
  console.log(`Email: ${email}`);
  console.log(`Token: ${apiToken.substring(0, 5)}***`);
  console.log("");

  try {
    // Test 1: Direct connection to Jira
    console.log("📡 Test 1: Direct connection to Jira API");
    const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
    
    const directResponse = await fetch(`${instanceUrl}/rest/api/3/myself`, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    console.log(`Status: ${directResponse.status} ${directResponse.statusText}`);
    
    if (!directResponse.ok) {
      const errorData = await directResponse.text();
      console.error("❌ Direct connection failed!");
      console.error("Response:", errorData);
    } else {
      const userData = await directResponse.json();
      console.log("✅ Direct connection successful!");
      console.log("User:", userData.displayName);
    }

    console.log("");

    // Test 2: Via backend proxy
    console.log("📡 Test 2: Connection via backend proxy (localhost:3001)");
    const proxyResponse = await fetch("http://localhost:3001/api/jira/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instanceUrl,
        email,
        apiToken,
      }),
    });

    console.log(`Status: ${proxyResponse.status} ${proxyResponse.statusText}`);
    const proxyData = await proxyResponse.json();
    
    if (!proxyResponse.ok) {
      console.error("❌ Backend proxy test failed!");
      console.error("Response:", proxyData);
    } else {
      console.log("✅ Backend proxy test successful!");
      console.log("Response:", proxyData);
    }

  } catch (error) {
    console.error("💥 Error:", error instanceof Error ? error.message : error);
  }
}

testConnection();
