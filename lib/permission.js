import _ from 'lodash'

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000'

export default {
  hasPermission: ({ sourceType, sourceModel, sourceId, permissions, orgUser }) => {
    const roles = _.orderBy(orgUser?.roles?.nodes, 'priority')
    sourceId = sourceId || sourceModel?.id
    const userPermissions = _.filter(_.flatten(_.map(roles, (role) => {
      const sourceIdPermissions = sourceId && _.filter(role.permissions.nodes, { sourceType, sourceId })
      const sourceTypePermissions = sourceId && _.filter(role.permissions.nodes, { sourceType, sourceId: EMPTY_UUID })
      const globalPermissions = _.filter(role.permissions.nodes, { sourceType: 'global' })
      return [].concat(
        sourceIdPermissions, sourceTypePermissions, globalPermissions
      )
    })))
    return _.every(permissions, (permission) =>
      _.find(userPermissions, (perm) => {
        return perm.permission === permission && (perm.value === true || perm.value === false)
      })?.value
    )
  },

  filterByOrgUser ({ sourceModels, permissions, sourceType, orgUser }) {
    return _.filter(sourceModels, (sourceModel) => {
      if (!sourceModel) {
        return
      }

      return _.every(permissions, (permission) =>
        this.hasPermission({ sourceType, sourceModel, permissions, orgUser })
      )
    })
  }
}
