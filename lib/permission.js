import _ from 'lodash'

export default {
  hasPermission: ({ sourceType, sourceModel, permissions, orgUser }) => {
    const roles = orgUser?.roles?.nodes
    const sourceId = sourceModel?.id
    return _.every(permissions, (permission) =>
      _.find(roles, (role) => {
        const customPermissions = sourceId && _.filter(role.permissions.nodes, { sourceType, sourceId })
        const globalPermissions = _.filter(role.permissions.nodes, { sourceType: 'global' })
        const allPermissions = [].concat(
          customPermissions, globalPermissions
        )
        return _.find(allPermissions, { permission })?.value
      })
    )
  },

  filterByOrgUser ({ models, permissions, sourceType, orgUser }) {
    return _.filter(models, (sourceModel) => {
      if (!sourceModel) {
        return
      }
      return _.every(permissions, (permission) =>
        this.hasPermission({ sourceType, sourceModel, permissions, orgUser })
      )
    })
  }
}
