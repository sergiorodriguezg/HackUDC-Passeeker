# Passeeker – Seeking the Perfect Key

## Descripción del proyecto

Passeeker es una aplicación de escritorio desarrollada con Electron cuyo objetivo es proporcionar una herramienta segura para la generación, verificación, almacenamiento y recuperación de contraseñas.

El proyecto responde a un problema ampliamente reconocido en ciberseguridad: el uso de contraseñas débiles, reutilizadas o almacenadas de forma insegura. Passeeker implementa un modelo de bóveda local cifrada que permite gestionar credenciales de manera segura sin depender de almacenamiento en la nube.

---

## Objetivo

Desarrollar una herramienta que permita:

- Verificar contraseñas frente a filtraciones públicas.
- Generar contraseñas robustas mediante distintos mecanismos.
- Almacenar credenciales de forma cifrada.
- Recuperar contraseñas de forma segura bajo autenticación.

---

## Arquitectura del sistema

La aplicación se compone de:

- **Frontend:** Electron (HTML, CSS, JavaScript)
- **Backend local:** Servidor Express embebido
- **Base de datos:** SQLite (better-sqlite3)
- **Cifrado:** AES-256-GCM
- **Derivación de clave:** scrypt

---

## Características principales

### 1. Bóveda local cifrada
Las contraseñas se almacenan cifradas mediante AES-256-GCM.  
La clave de cifrado se deriva de la contraseña maestra mediante scrypt.

### 2. Verificación de filtraciones
Integración con la API pública de Have I Been Pwned (modelo k-anonymity) para comprobar si una contraseña ha sido expuesta en brechas de seguridad.

### 3. Generación de contraseñas
- Generación aleatoria mediante Random.org.
- Fallback criptográfico local mediante `crypto`.
- Generación opcional de frases memorables usando Hugging Face Inference API.

### 4. Autenticación y seguridad
- Configuración inicial de usuario y contraseña maestra.
- Derivación segura de clave de bóveda.
- Sistema de sesión con token.
- Sistema de emparejamiento con extensión de navegador.

---

## Instalación

### Requisitos

- Node.js 18 o superior
- npm

### Pasos

```bash
git clone https://github.com/tu-usuario/passeeker.git
cd passeeker
npm install
npm start
