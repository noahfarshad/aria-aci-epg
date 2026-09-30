/**
 * ============================================================================
 * SIMPLE vRO SCRIPTABLE TASK - Place VM into ACI EPG
 * ============================================================================
 * 
 * Author: Noah Farshad
 * Version: 1.1.0
 * Date: December 2024
 * 
 * This is a single scriptable task version that can be copied directly into
 * a vRO workflow. It contains all the logic in one script for easy deployment.
 * 
 * UPDATED: Now supports both username/password AND API token authentication
 * 
 * INPUT PARAMETERS:
 * - apicHost (string) - APIC hostname or IP
 * - apicUsername (string) - APIC username (required for password auth)
 * - apicPassword (SecureString) - APIC password (leave empty if using token)
 * - apicToken (SecureString) - API token (leave empty if using username/password)
 * - tenantName (string) - ACI tenant name
 * - appProfileName (string) - ACI application profile name
 * - epgName (string) - ACI endpoint group name
 * - vmmDomainName (string) - VMware VMM domain name
 * - vm (VC:VirtualMachine) - VM to place in EPG
 * - networkAdapterLabel (string) - Network adapter label (e.g., "Network adapter 1")
 * 
 * OUTPUT PARAMETERS:
 * - success (boolean) - True if successful
 * - message (string) - Status message
 * - portGroupName (string) - Port group the VM was connected to
 * 
 * ============================================================================
 */

(function() {
    try {
        // ====================================================================
        // STEP 1: Authenticate to APIC
        // ====================================================================
        System.log("=== Starting Place VM into ACI EPG Workflow ===");
        System.log("APIC Host: " + apicHost);
        System.log("Tenant: " + tenantName);
        System.log("App Profile: " + appProfileName);
        System.log("EPG: " + epgName);
        System.log("VMM Domain: " + vmmDomainName);
        System.log("VM: " + vm.name);
        
        var restHost = RESTHostManager.createHost("dynamicHost");
        restHost.url = "https://" + apicHost;
        restHost.hostVerification = false;
        
        var token;
        
        // Determine authentication method
        if (apicToken && apicToken.length > 0) {
            // Use provided API token
            System.log("Using provided API token for authentication");
            token = apicToken;
            
        } else if (apicUsername && apicPassword && apicPassword.length > 0) {
            // Authenticate with username/password
            System.log("Authenticating to APIC with username/password");
            
            var authPayload = {
                "aaaUser": {
                    "attributes": {
                        "name": apicUsername,
                        "pwd": apicPassword
                    }
                }
            };
            
            var authRequest = restHost.createRequest("POST", "/api/aaaLogin.json", JSON.stringify(authPayload));
            authRequest.contentType = "application/json";
            
            var authResponse = authRequest.execute();
            
            if (authResponse.statusCode !== 200) {
                throw new Error("APIC authentication failed - Status: " + authResponse.statusCode);
            }
            
            var authJson = JSON.parse(authResponse.contentAsString);
            token = authJson.imdata[0].aaaLogin.attributes.token;
            System.log("Successfully authenticated to APIC");
            
        } else {
            throw new Error("Either apicToken or both apicUsername and apicPassword must be provided");
        }
        
        // ====================================================================
        // STEP 2: Verify EPG exists and is associated with VMM domain
        // ====================================================================
        System.log("Verifying EPG exists and getting VMM domain association");
        
        var epgPath = "/api/node/mo/uni/tn-" + tenantName + 
                      "/ap-" + appProfileName + 
                      "/epg-" + epgName + 
                      ".json?query-target=children&target-subtree-class=fvRsDomAtt";
        
        var epgRequest = restHost.createRequest("GET", epgPath, null);
        epgRequest.contentType = "application/json";
        epgRequest.setHeader("Cookie", "APIC-cookie=" + token);
        
        var epgResponse = epgRequest.execute();
        
        if (epgResponse.statusCode !== 200) {
            throw new Error("Failed to query EPG - Status: " + epgResponse.statusCode);
        }
        
        var epgJson = JSON.parse(epgResponse.contentAsString);
        
        // Check VMM domain association
        var vmmDomainDn = "uni/vmmp-VMware/dom-" + vmmDomainName;
        var foundDomain = false;
        
        if (epgJson.imdata) {
            for (var i = 0; i < epgJson.imdata.length; i++) {
                var domAtt = epgJson.imdata[i].fvRsDomAtt;
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
        
        // ====================================================================
        // STEP 3: Determine port group name
        // ====================================================================
        // Port group name format in vSphere: tenant|appProfile|epgName
        portGroupName = tenantName + "|" + appProfileName + "|" + epgName;
        System.log("Port group name: " + portGroupName);
        
        // ====================================================================
        // STEP 4: Change VM network adapter
        // ====================================================================
        System.log("Changing VM network adapter to port group: " + portGroupName);
        
        // Get VM's network adapters
        var devices = vm.config.hardware.device;
        var networkAdapter = null;
        
        for (var j = 0; j < devices.length; j++) {
            var device = devices[j];
            if (device.deviceInfo && device.deviceInfo.label === networkAdapterLabel) {
                networkAdapter = device;
                System.log("Found network adapter: " + networkAdapterLabel);
                break;
            }
        }
        
        if (!networkAdapter) {
            throw new Error("Network adapter '" + networkAdapterLabel + "' not found on VM");
        }
        
        // Find the port group on the VM's host
        var host = vm.runtime.host;
        var networks = host.network;
        var targetNetwork = null;
        
        for (var k = 0; k < networks.length; k++) {
            if (networks[k].name === portGroupName) {
                targetNetwork = networks[k];
                System.log("Found port group on host: " + portGroupName);
                break;
            }
        }
        
        if (!targetNetwork) {
            throw new Error("Port group '" + portGroupName + "' not found on VM's host. " +
                          "Ensure the EPG is associated with the VMM domain and the host is connected to the VDS.");
        }
        
        // Create device change spec
        var configSpec = new VcVirtualMachineConfigSpec();
        var deviceChange = new VcVirtualDeviceConfigSpec();
        deviceChange.operation = VcVirtualDeviceConfigSpecOperation.edit;
        deviceChange.device = networkAdapter;
        
        // Update backing info to point to new network
        if (targetNetwork instanceof VcDistributedVirtualPortgroup) {
            // Distributed virtual port group (most common with ACI)
            var dvPortBacking = new VcVirtualEthernetCardDistributedVirtualPortBackingInfo();
            var portConnection = new VcDistributedVirtualSwitchPortConnection();
            
            portConnection.switchUuid = targetNetwork.config.distributedVirtualSwitch.uuid;
            portConnection.portgroupKey = targetNetwork.key;
            
            dvPortBacking.port = portConnection;
            networkAdapter.backing = dvPortBacking;
            
        } else {
            // Standard port group (less common)
            var networkBacking = new VcVirtualEthernetCardNetworkBackingInfo();
            networkBacking.deviceName = portGroupName;
            networkBacking.network = targetNetwork;
            networkAdapter.backing = networkBacking;
        }
        
        deviceChange.device = networkAdapter;
        configSpec.deviceChange = [deviceChange];
        
        // Apply the configuration
        System.log("Applying network configuration change...");
        var task = vm.reconfigVM_Task(configSpec);
        
        // Wait for task completion
        var taskResult = System.getModule("com.vmware.library.vc.basic").vim3WaitTaskEnd(task, true, 2);
        
        if (taskResult === "success") {
            success = true;
            message = "Successfully placed VM '" + vm.name + "' into EPG '" + epgName + "' (port group: " + portGroupName + ")";
            System.log(message);
            System.log("=== Workflow completed successfully ===");
        } else {
            throw new Error("Failed to change network adapter. Task result: " + taskResult);
        }
        
    } catch (e) {
        success = false;
        message = "Workflow failed: " + e.message;
        System.error(message);
        System.error("=== Workflow failed ===");
        throw e;
    }
})();
