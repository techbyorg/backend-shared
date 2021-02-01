import _ from 'lodash'
import GraphQLTools from 'graphql-tools'
import { ErrorObject, Permission } from 'backend-shared'

const { SchemaDirectiveVisitor } = GraphQLTools

export const auth = class AuthDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition (field) {
    const { resolve } = field
    field.resolve = function (result, args, context, info) {
      console.log('user')
      if (context.user == null) {
        throw new ErrorObject('', 401, { info: 'Unauthorized' })
      }
      return resolve(result, args, context, info)
    }
  }
}

export const hasPermissions = class HasPermissionsDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition (field) {
    const { resolve } = field
    const { sourceType, permission, useArgs, useResponse } = this.args

    if (!useArgs && !useResponse) {
      throw new Error('Must specify useArgs or useResponse')
    }

    field.resolve = async function (result, args, context, info) {
      const orgUser = context.org.orgUser
      const response = await resolve(result, args, context, info)
      let hasPermission
      if (useArgs) {
        if (args.ids) {
          hasPermission = _.every(args.ids, (id) =>
            Permission.hasPermission({ sourceType, sourceId: id, permissions: [permission], orgUser })
          )
        } else if (args.id) {
          hasPermission = Permission.hasPermission({ sourceType, sourceId: args.id, permissions: [permission], orgUser })
        }
      } else if (useResponse) {
        if (response.nodes) {
          const sourceModels = response.nodes
          hasPermission = true
          response.nodes = Permission.filterByOrgUser({ sourceType, sourceModels, permissions: [permission], orgUser })
        } else {
          const sourceModel = response
          hasPermission = Permission.hasPermission({ sourceType, sourceModel, permissions: [permission], orgUser })
        }
      }
      if (!hasPermission) {
        throw new ErrorObject('', 401, { info: 'Unauthorized' })
      }
      return response
    }
  }
}
