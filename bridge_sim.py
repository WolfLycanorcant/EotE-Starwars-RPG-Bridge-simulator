# bridge_sim.py
from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import json

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Simplified vehicle database (JSON instead of XML)
VEHICLES = {
    "millennium_falcon": {
        "name": "Millennium Falcon",
        "type": "Freighter",
        "shields": 100,
        "weapons": ["Quad Laser Cannons", "Concussion Missiles"]
    }
}

# Track connected users
users = {}

@app.route('/')
def index():
    return render_template('bridge.html')

@socketio.on('join')
def handle_join(data):
    users[data['session_id']] = {
        'station': data['station'],
        'name': data['name']
    }
    emit('update_users', users, broadcast=True)

@socketio.on('power_update')
def handle_power(data):
    # Handle power distribution logic
    emit('power_update', data, broadcast=True)

if __name__ == '__main__':
    socketio.run(app, debug=True)