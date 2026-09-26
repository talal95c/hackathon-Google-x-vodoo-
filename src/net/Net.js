// Réseau multijoueur : brokers MQTT publics (voir MqttNet.js). Aucun serveur à nous, aucun compte,
// compatible itch.io et tous les réseaux (connexion sortante wss:// uniquement).
export { connectMqtt as connect } from './MqttNet.js';
