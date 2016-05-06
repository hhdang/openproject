//-- copyright
// OpenProject is a project management system.
// Copyright (C) 2012-2015 the OpenProject Foundation (OPF)
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License version 3.
//
// OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
// Copyright (C) 2006-2013 Jean-Philippe Lang
// Copyright (C) 2010-2013 the ChiliProject Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
//
// See doc/COPYRIGHT.rdoc for more details.
//++

function wpResource(
  HalResource:typeof op.HalResource,
  apiWorkPackages,
  NotificationsService:any,
  $q:ng.IQService

) {
  class WorkPackageResource extends HalResource {
    private form;
    public schema;
    public id;

    public static fromCreateForm(projectIdentifier?:string):ng.IPromise<WorkPackageResource> {
      var deferred = $q.defer();

      apiWorkPackages.emptyCreateForm(projectIdentifier)
      .then(resource => {
        var wp = new WorkPackageResource(resource.payload.$source, true);

        // Copy resources from form response
        wp.schema = resource.schema;
        wp.form = $q.when(resource);
        wp.id = 'new-' + Date.now();

        // Set update link to form
        wp.$links.update = resource.$links.self;

        deferred.resolve(wp);
      })
      .catch(deferred.reject);

      return deferred.promise;
    }

    public get isNew():boolean {
      var id = Number(this.id);
      return isNaN(id);
    }

    public requiredValueFor(fieldName):boolean {
      var fieldSchema = this.schema[fieldName];
      return !this[fieldName] && fieldSchema.writable && fieldSchema.required;
    }

    public allowedValuesFor(field):ng.IPromise<op.HalResource[]> {
      var deferred = $q.defer();
      this.getForm().then(form => {
        const allowedValues = form.$embedded.schema[field].allowedValues;

        if (Array.isArray(allowedValues)) {
          deferred.resolve(allowedValues);
        } else {
          return allowedValues.$load().then(loadedValues => {
            deferred.resolve(loadedValues.elements);
          });
        }
      });

      return deferred.promise;
    }

    public setAllowedValueFor(field, href) {
      this.allowedValuesFor(field).then(allowedValues => {
        this[field] = _.find(allowedValues, (entry:any) => (entry.href === href));
      });
    }

    public getForm() {
      if (!this.form) {
        this.form = this.$links.update(this);
        this.form.catch(error => {
          NotificationsService.addError(error.data.message);
        });
      }
      return this.form;
    }

    public getSchema() {
      return this.getForm().then(form => {
        const schema = form.$embedded.schema;

        angular.forEach(schema, (field, name) => {
          if (this[name] && field && field.writable && field.$isHal
            && Array.isArray(field.allowedValues)) {

            this[name] = _.where(field.allowedValues, {name: this[name].name})[0];
          }
        });

        return schema;
      });
    }

    public save() {
      const plain = this.$plain();

      delete plain.createdAt;
      delete plain.updatedAt;

      var deferred = $q.defer();

      // Always resolve form to the latest form
      // This way, we won't have to actively reset it.
      this.form = this.$links.update(this.$source);

      this.form
        .catch(deferred.reject)
        .then(form => {

          // Override the current schema with
          // the changes from API
          this.schema = form.$embedded.schema;

          // Merge attributes from form with resource
          var payload = this.mergeWithForm(form);

          this.saveResource(payload)
            .then(workPackage => {
              angular.extend(this, workPackage);

              deferred.resolve(this);
            }).catch((error) => {
              deferred.reject(error);
            });
        });

      return deferred.promise;
    }

    public get isLeaf():boolean {
      var children = this.$links.children;
      return !(children && children.length > 0);
    }

    public isParentOf(otherWorkPackage) {
      return otherWorkPackage.parent.$links.self.$link.href ===
        this.$links.self.$link.href;
    }

    public get isEditable():boolean {
      return !!this.$links.update || this.isNew;
    }

    protected saveResource(payload):ng.IPromise<any> {
      if (this.isNew) {
        return apiWorkPackages.wpApiPath().post(payload);
      }

      return this.$links.updateImmediately(payload);
    }

    private mergeWithForm(form) {
      var plainPayload = form.payload.$source;
      var schema = form.$embedded.schema;

      // Merge embedded properties from form payload
      // Do not use properties on this, since they may be incomplete
      // e.g., when switching to a type that requires a custom field.
      angular.forEach(plainPayload, (_value, key) => {
        if (typeof(schema[key]) === 'object' && schema[key]['writable'] === true) {
          plainPayload[key] = this[key];
        }
      });

      // Merged linked properties from form payload
      angular.forEach(plainPayload._links, (_value, key) => {
        if (this[key] && typeof(schema[key]) === 'object' && schema[key]['writable'] === true) {
          var value = this[key].href === 'null' ? null : this[key].href;
          plainPayload._links[key] = {href: value};
        }
      });

      return plainPayload;
    }
  }

  return WorkPackageResource;
}

angular
  .module('openproject.api')
  .factory('WorkPackageResource', wpResource);