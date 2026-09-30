/**
 * vRealize Orchestrator / Aria Automation Orchestrator Action
 * Action Name: vcenterChangeVmNetwork
 * Module: com.essential.aci
 * 
 * Author: Noah Farshad
 * Date: December 2024
 * 
 * Description: Changes a VM's network adapter to connect to a specific port group
 * 
 * @param {VC:VirtualMachine} vm - The VM to modify
 * @param {string} networkAdapterLabel - Network adapter label (e.g., "Network adapter 1")
 * @param {string} portGroupName - Name of the port group to connect to
 * @return {boolean} True if successful
 */

function vcenterChangeVmNetwork(vm, networkAdapterLabel, portGroupName) {
    try {
        System.log("Changing VM '" + vm.name + "' network adapter '" + networkAdapterLabel + 
                   "' to port group: " + portGroupName);
        
        // Get VM's network adapters
        var devices = vm.config.hardware.device;
        var networkAdapter = null;
        
        for (var i = 0; i < devices.length; i++) {
            var device = devices[i];
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
        
        for (var j = 0; j < networks.length; j++) {
            if (networks[j].name === portGroupName) {
                targetNetwork = networks[j];
                System.log("Found port group on host: " + portGroupName);
                break;
            }
        }
        
        if (!targetNetwork) {
            throw new Error("Port group '" + portGroupName + "' not found on VM's host");
        }
        
        // Create device change spec
        var configSpec = new VcVirtualMachineConfigSpec();
        var deviceChange = new VcVirtualDeviceConfigSpec();
        deviceChange.operation = VcVirtualDeviceConfigSpecOperation.edit;
        deviceChange.device = networkAdapter;
        
        // Update backing info to point to new network
        if (targetNetwork instanceof VcDistributedVirtualPortgroup) {
            // Distributed virtual port group
            var dvPortBacking = new VcVirtualEthernetCardDistributedVirtualPortBackingInfo();
            var portConnection = new VcDistributedVirtualSwitchPortConnection();
            
            portConnection.switchUuid = targetNetwork.config.distributedVirtualSwitch.uuid;
            portConnection.portgroupKey = targetNetwork.key;
            
            dvPortBacking.port = portConnection;
            networkAdapter.backing = dvPortBacking;
            
        } else {
            // Standard port group
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
            System.log("Successfully changed VM network adapter to port group: " + portGroupName);
            return true;
        } else {
            throw new Error("Failed to change network adapter. Task result: " + taskResult);
        }
        
    } catch (e) {
        System.error("Failed to change VM network: " + e.message);
        throw new Error("Failed to change VM network: " + e.message);
    }
}
