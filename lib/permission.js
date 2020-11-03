import _ from 'lodash'

export default {
  filterByOrgUser ({ models, permissions, sourceType, orgUser }) {
    const roles = orgUser?.roles?.nodes
    return _.filter(models, (model) => {
      const sourceId = model.id
      const isPrivate = !model.defaultPermissions?.view
      return _.every(permissions, (permission) =>
        _.find(roles, (role) => {
          const customPermissions = sourceId && _.filter(role.permissions, { sourceType, sourceId })
          const globalSourceType = isPrivate ? 'global-private' : 'global-public'
          const globalPermissions = _.filter(role.permissions, { sourceType: globalSourceType })
          const allPermissions = [].concat(
            customPermissions, globalPermissions
          )
          return _.find(allPermissions, { permission })?.value
        })
      )
    })
  }
}
