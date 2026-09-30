/**
 * vRealize Orchestrator / Aria Automation Orchestrator Action
 * Action Name: apicListEpgs
 * Module: com.essential.aci
 * 
 * Author: Noah Farshad
 * Date: December 2024
 * 
 * Description: Lists all EPGs in a tenant/app profile that are associated with a VMM domain
 * 
 * @param {Properties} apicSession - Session info from apicAuthenticate
 * @param {string} tenantName - ACI tenant name
 * @param {string} appProfileName - ACI application profile name (optional - leave empty for all)
 * @param {string} vmmDomainName - VMware VMM domain name (optional - filters EPGs by VMM domain)
 * @return {Array/string} Array of EPG names
 */

function apicListEpgs(apicSession, tenantName, appProfileName, vmmDomainName) {
    try {
        var token = apicSession.get("token");
        var restHost = apicSession.get("restHost");
        
        var queryPath;
        
        if (appProfileName && appProfileName.length > 0) {
            // Query specific application profile
            System.log("Listing EPGs in tenant: " + tenantName + ", app profile: " + appProfileName);
            queryPath = "/api/node/mo/uni/tn-" + tenantName + 
                       "/ap-" + appProfileName + 
                       ".json?query-target=children&target-subtree-class=fvAEPg&rsp-subtree=children&rsp-subtree-class=fvRsDomAtt";
        } else {
            // Query all app profiles in tenant
            System.log("Listing all EPGs in tenant: " + tenantName);
            queryPath = "/api/node/class/fvAEPg.json?query-target-filter=wcard(fvAEPg.dn,\"tn-" + tenantName + "/\")" +
                       "&rsp-subtree=children&rsp-subtree-class=fvRsDomAtt";
        }
        
        var request = restHost.createRequest("GET", queryPath, null);
        request.contentType = "application/json";
        request.setHeader("Cookie", "APIC-cookie=" + token);
        
        var response = request.execute();
        
        if (response.statusCode !== 200) {
            throw new Error("Failed to list EPGs - Status: " + response.statusCode + 
                          " - " + response.contentAsString);
        }
        
        var responseJson = JSON.parse(response.contentAsString);
        var epgList = [];
        var vmmDomainDn = vmmDomainName ? "uni/vmmp-VMware/dom-" + vmmDomainName : null;
        
        if (responseJson.imdata) {
            for (var i = 0; i < responseJson.imdata.length; i++) {
                var epg = responseJson.imdata[i].fvAEPg;
                if (epg) {
                    var epgName = epg.attributes.name;
                    var epgDn = epg.attributes.dn;
                    
                    // If VMM domain filter specified, check domain association
                    if (vmmDomainDn && epg.children) {
                        var hasVmmDomain = false;
                        for (var j = 0; j < epg.children.length; j++) {
                            var child = epg.children[j];
                            if (child.fvRsDomAtt && child.fvRsDomAtt.attributes.tDn === vmmDomainDn) {
                                hasVmmDomain = true;
                                break;
                            }
                        }
                        if (!hasVmmDomain) {
                            continue; // Skip EPGs not in the specified VMM domain
                        }
                    }
                    
                    // Extract app profile from DN if needed
                    var dnParts = epgDn.split("/");
                    var apName = "";
                    for (var k = 0; k < dnParts.length; k++) {
                        if (dnParts[k].indexOf("ap-") === 0) {
                            apName = dnParts[k].substring(3);
                            break;
                        }
                    }
                    
                    // Add to list with format "AppProfile/EPGName" if querying entire tenant
                    if (!appProfileName || appProfileName.length === 0) {
                        epgList.push(apName + "/" + epgName);
                    } else {
                        epgList.push(epgName);
                    }
                }
            }
        }
        
        System.log("Found " + epgList.length + " EPGs");
        
        // Sort alphabetically
        epgList.sort();
        
        return epgList;
        
    } catch (e) {
        System.error("Failed to list EPGs: " + e.message);
        throw new Error("EPG list query failed: " + e.message);
    }
}
