/**
 * vRealize Orchestrator / Aria Automation Orchestrator Action
 * Action Name: apicVerifyEpgExists
 * Module: com.essential.aci
 * 
 * Author: Noah Farshad
 * Date: December 2024
 * 
 * Description: Verifies an EPG exists and optionally checks VMM domain association
 * 
 * @param {Properties} apicSession - Session info from apicAuthenticate
 * @param {string} tenantName - ACI tenant name
 * @param {string} appProfileName - ACI application profile name
 * @param {string} epgName - ACI endpoint group name
 * @param {string} vmmDomainName - VMware VMM domain name (optional)
 * @return {boolean} True if EPG exists (and is in VMM domain if specified)
 */

function apicVerifyEpgExists(apicSession, tenantName, appProfileName, epgName, vmmDomainName) {
    try {
        var token = apicSession.get("token");
        var restHost = apicSession.get("restHost");
        
        System.log("Verifying EPG exists: " + tenantName + "/" + appProfileName + "/" + epgName);
        
        // Query the EPG
        var epgPath = "/api/node/mo/uni/tn-" + tenantName + 
                      "/ap-" + appProfileName + 
                      "/epg-" + epgName + ".json";
        
        // If VMM domain check requested, include children query
        if (vmmDomainName && vmmDomainName.length > 0) {
            epgPath += "?query-target=children&target-subtree-class=fvRsDomAtt";
        }
        
        var request = restHost.createRequest("GET", epgPath, null);
        request.contentType = "application/json";
        request.setHeader("Cookie", "APIC-cookie=" + token);
        
        var response = request.execute();
        
        if (response.statusCode === 404) {
            System.log("EPG does not exist");
            return false;
        }
        
        if (response.statusCode !== 200) {
            throw new Error("Failed to verify EPG - Status: " + response.statusCode + 
                          " - " + response.contentAsString);
        }
        
        var responseJson = JSON.parse(response.contentAsString);
        
        if (!responseJson.imdata || responseJson.imdata.length === 0) {
            System.log("EPG does not exist");
            return false;
        }
        
        // If VMM domain check requested, verify association
        if (vmmDomainName && vmmDomainName.length > 0) {
            var vmmDomainDn = "uni/vmmp-VMware/dom-" + vmmDomainName;
            var foundDomain = false;
            
            for (var i = 0; i < responseJson.imdata.length; i++) {
                var domAtt = responseJson.imdata[i].fvRsDomAtt;
                if (domAtt && domAtt.attributes.tDn === vmmDomainDn) {
                    foundDomain = true;
                    System.log("EPG is associated with VMM domain: " + vmmDomainName);
                    break;
                }
            }
            
            if (!foundDomain) {
                System.log("EPG exists but is not associated with VMM domain: " + vmmDomainName);
                return false;
            }
        }
        
        System.log("EPG verification successful");
        return true;
        
    } catch (e) {
        System.error("Failed to verify EPG: " + e.message);
        throw new Error("Failed to verify EPG: " + e.message);
    }
}
