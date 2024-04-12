"use strict"

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Users", "dateOfBirth", {
      type: Sequelize.DATE,
      allowNull: true
    })
    await queryInterface.addColumn("Users", "pendingDeletionDate", {
      type: Sequelize.DATE,
      allowNull: true
    })
  }
}
