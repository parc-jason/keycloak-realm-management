const log = require('npmlog');


class ServiceClientManager {
  constructor(realmAdminService) {
    this.svc = realmAdminService;
  }

  async getClients() {
    let clients = await this.svc.getClients();
    return clients;
  }

  async manage({applicationAcronym, applicationName, applicationDescription, commonServices}) {
    log.info('ServiceClientManager.manage ', `${applicationAcronym}, ${applicationName}, ${applicationDescription}, [${commonServices}]`);

    const clientId = `${applicationAcronym.toUpperCase()}_SERVICE_CLIENT`;
    const clientRoleName = 'COMMON_SERVICES';

    const clients = await this.getClients();
    let serviceClient = clients.find(x => x.clientId === clientId);
    if (!serviceClient) {
      serviceClient = await this.svc.createClient(clientId, applicationName, applicationDescription);
    } else {
      // may have changed the name and description...
      serviceClient = await this.svc.updateClientDetails(serviceClient, applicationName, applicationDescription);
    }

    // get all the selected common services and their roles
    // add roles to the lob COMMON_SERVICE role
    // commonServices is an array of clientIds
    let commonServiceRoles = [];
    if (commonServices && commonServices.length > 0) {
      for (const cmnSrvClientId of commonServices) {
        const cmnSrvClient = clients.find(y => { return cmnSrvClientId === y.clientId; });
        if (cmnSrvClient) {
          const cmnSrvClientRoles = await this.svc.getClientRoles(cmnSrvClient.id);
          commonServiceRoles = commonServiceRoles.concat(cmnSrvClientRoles);
        }
      }
    }

    // this is an easier way than reading which roles and composites are in place.
    // just remove the service client role (if exists) and start from scratch each time.
    let clientRoles = await this.svc.getClientRoles(serviceClient.id);
    let commonServicesRole = clientRoles.find(x => x.name === clientRoleName);
    if (commonServicesRole) {
      await this.svc.removeClientRole(serviceClient.id, clientRoleName);
    }

    // add in new role...
    clientRoles = await this.svc.addClientRole(serviceClient.id, clientRoleName);
    // get the common service role for service client
    commonServicesRole = clientRoles.find(x => x.name === clientRoleName);

    // pass in the list of roles from the common services (if any).
    // this will set the composite roles, the service client will have access to all of these common service roles.
    await this.svc.setRoleComposites(serviceClient, clientRoleName, commonServiceRoles);

    // get the service account user...
    const serviceAccountUser = await this.svc.getServiceAccountUser(serviceClient.id);
    //  add the service account role to them...
    await this.svc.addServiceAccountRole(serviceAccountUser.id, serviceClient.id, commonServicesRole);

    // now go get the lob client secret, and we will return it
    const clientSecret = await this.svc.getClientSecret(serviceClient.id);

    // return information for logging in as this new service client.
    return {
      generatedPassword: clientSecret.value,
      generatedServiceClient: serviceClient.clientId,
      oidcTokenUrl: this.svc.tokenUrl
    };
  }
}

module.exports = ServiceClientManager;
