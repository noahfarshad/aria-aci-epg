/**
 * vRealize Orchestrator / Aria Automation Orchestrator Action
 * Action Name: apicGetEpgPortGroup
 * Module: com.essential.aci
 * 
 * Author: Noah Farshad
 * Date: December 2024
 * 
 * Description: Gets the vSphere distributed port group name for an ACI EPG
 *              that is associated with a VMM domain
 * 
 * @param {Properties} apicSession - Session info from apicAuthenticate
 * @param {string} tenantName - ACI tenant name
 * @param {string} appProfileName - ACI application profile name
 * @param {string} epgName - ACI endpoint group name
 * @param {string} vmmDomainName - VMware VMM domain name in ACI
 * @return {string} Port group name in format: tenant|appProfile|epgName
 */

function apicGetEpgPortGroup(apicSession, tenantName, appProfileName, epgName, vmmDomainName) {
    try {
        var token = apicSession.get("token");
        var restHost = apicSession.get("restHost");
        
        System.log("Getting port group name for EPG: " + tenantName + "/" + appProfileName + "/" + epgName);
        
        // Query the EPG to verify it exists and get VMM domain association
        var epgPath = "/api/node/mo/uni/tn-" + tenantName + 
                      "/ap-" + appProfileName + 
                      "/epg-" + epgName + ".json?query-target=children&target-subtree-class=fvRsDomAtt";
        
        var request = restHost.createRequest("GET", epgPath, null);
        request.contentType = "application/json";
        request.setHeader("Cookie", "APIC-cookie=" + token);
        
        var response = request.execute();
        
        if (response.statusCode !== 200) {
            throw new Error("Failed to query EPG - Status: " + response.statusCode + 
                          " - " + response.contentAsString);
        }
        
        var responseJson = JSON.parse(response.contentAsString);
        
        // Verify EPG is associated with the VMM domain
        var vmmDomainDn = "uni/vmmp-VMware/dom-" + vmmDomainName;
        var foundDomain = false;
        
        if (responseJson.imdata) {
            for (var i = 0; i < responseJson.imdata.length; i++) {
                var domAtt = responseJson.imdata[i].fvRsDomAtt;
                if (domAtt && domAtt.attributes.tDn === vmmDomainDn) {
                    foundDomain = true;
                    System.log("Verified EPG is associated with VMM domain: " + vmmDomainName);
                    break;
                }
            }
        }
        
        if (!foundDomain) {
            throw new Error("EPG '" + epgName + "' is not associated with VMM domain '" + vmmDomainName + "'");
        }
        
        // Port group name format in vSphere: tenant|appProfile|epgName
        var portGroupName = tenantName + "|" + appProfileName + "|" + epgName;
        
        System.log("Port group name: " + portGroupName);
        return portGroupName;
        
    } catch (e) {
        System.error("Failed to get EPG port group: " + e.message);
        throw new Error("Failed to get EPG port group: " + e.message);
    }
}
