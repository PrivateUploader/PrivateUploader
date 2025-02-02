"use strict"

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("ChatInvites", "userId", {
      type: Sequelize.BIGINT,
      allowNull: true
    })
    try {
      await queryInterface.removeConstraint("ChatInvites", "chatinvites_ibfk_1")
    } catch {}
  }
}
