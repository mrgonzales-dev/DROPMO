import { defineStore } from "pinia";

export const usePublicVarsStore = defineStore("publicvars", {
  state: () => ({
    publicVars: {},
  }),

  actions: {
    addPublicVar(key, value) {
      this.publicVars[key] = value;
    },
    removePublicVar(key) {
      delete this.publicVars[key];
    },
    clearPublicVars() {
      this.publicVars = {};
    },
    printPublicVars() {
      console.log(this.publicVars);
    },
  },
});
