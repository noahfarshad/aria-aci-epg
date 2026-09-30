# Place a VM in an ACI EPG from Aria

The Cisco ACI plugin that shipped with Aria was validated through older vRA releases and stops being a supported path on current Aria Automation. These Orchestrator actions do the placement directly: authenticate to APIC, confirm the EPG, find the port group, and move the VM's NIC.

License: GPL-3.0. Built and proved out for [essential.coach](https://essential.coach).
Full write-up: [Cisco ACI and Aria Automation When the Vendor Plugin Stops](https://essential.coach/cisco-aci-aria-automation-when-the-plugin-stops/)

## Layout

```
PlaceVmIntoEpg_SingleScript.js   one scriptable task, if you want the whole path in one place
apicAuthenticate.js              session or token
apicListEpgs.js                  EPG list for a catalog dropdown
apicVerifyEpgExists.js           fail before the NIC move
apicGetEpgPortGroup.js           the vSphere port group ACI published
vcenterChangeVmNetwork.js        the NIC change
```

Import each file as an action in module `com.essential.aci`. Endpoints, tenants, and credentials are inputs. Nothing in these files is a site value.

The single script is the path to read first. Split it into the actions when a catalog form needs the EPG list on its own.
