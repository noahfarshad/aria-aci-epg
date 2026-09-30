/**
 * vRealize Orchestrator / Aria Automation Orchestrator Action
 * Action Name: apicAuthenticate
 * Module: com.essential.aci
 * 
 * Author: Noah Farshad
 * Date: December 2024
 * 
 * Description: Authenticates to Cisco APIC and returns session information.
 *              Supports both username/password and API token authentication.
 * 
 * @param {string} apicHost - APIC hostname or IP address
 * @param {string} apicUsername - APIC username (required for password auth, optional for token)
 * @param {SecureString} apicPassword - APIC password (optional if using token)
 * @param {SecureString} apicToken - Pre-generated API token (optional if using password)
 * @return {Properties} Session information containing token, host, and REST host object
 */

function apicAuthenticate(apicHost, apicUsername, apicPassword, apicToken) {
    try {
        // Create dynamic REST host for APIC
        var restHost = RESTHostManager.createHost("dynamicHost");
        var url = "https://" + apicHost;
        
        restHost.url = url;
        restHost.hostVerification = false; // Disable SSL verification (adjust for production)
        
        var token;
        
        // Determine authentication method
        if (apicToken && apicToken.length > 0) {
            // Use provided API token
            System.log("Using provided API token for authentication to APIC: " + apicHost);
            token = apicToken;
            
        } else if (apicUsername && apicPassword && apicPassword.length > 0) {
            // Authenticate with username and password
            System.log("Authenticating to APIC with username/password: " + apicHost);
            
            var authPayload = {
                "aaaUser": {
                    "attributes": {
                        "name": apicUsername,
                        "pwd": apicPassword
                    }
                }
            };
            
            var request = restHost.createRequest("POST", "/api/aaaLogin.json", JSON.stringify(authPayload));
            request.contentType = "application/json";
            
            var response = request.execute();
            
            if (response.statusCode !== 200) {
                throw new Error("Authentication failed - Status: " + response.statusCode + 
                              " - " + response.contentAsString);
            }
            
            var responseJson = JSON.parse(response.contentAsString);
            
            if (!responseJson.imdata || !responseJson.imdata[0] || !responseJson.imdata[0].aaaLogin) {
                throw new Error("Unexpected authentication response format");
            }
            
            token = responseJson.imdata[0].aaaLogin.attributes.token;
            System.log("Successfully obtained authentication token");
            
        } else {
            throw new Error("Either apicToken or both apicUsername and apicPassword must be provided");
        }
        
        // Validate token was obtained
        if (!token || token.length === 0) {
            throw new Error("Failed to obtain authentication token");
        }
        
        // Create session info object
        var sessionInfo = new Properties();
        sessionInfo.put("token", token);
        sessionInfo.put("apicHost", apicHost);
        sessionInfo.put("restHost", restHost);
        
        System.log("APIC authentication successful");
        return sessionInfo;
        
    } catch (e) {
        System.error("APIC authentication failed: " + e.message);
        throw new Error("APIC authentication failed: " + e.message);
    }
}
