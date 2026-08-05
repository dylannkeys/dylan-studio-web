USE dylan_studio_db;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.usp_CrearSolicitud
  @nombre VARCHAR(100),
  @apellido VARCHAR(100),
  @empresa VARCHAR(150) = NULL,
  @email VARCHAR(150),
  @asunto VARCHAR(150),
  @mensaje VARCHAR(2000),
  @id_servicio INT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF LEN(LTRIM(RTRIM(@nombre))) NOT BETWEEN 2 AND 100
    OR LEN(LTRIM(RTRIM(@apellido))) NOT BETWEEN 2 AND 100
    OR LEN(LTRIM(RTRIM(@email))) NOT BETWEEN 5 AND 150
    OR @email NOT LIKE '%_@_%._%'
    OR LEN(LTRIM(RTRIM(@asunto))) NOT BETWEEN 5 AND 150
    OR LEN(LTRIM(RTRIM(@mensaje))) NOT BETWEEN 10 AND 2000
    THROW 50001, 'Datos de solicitud no válidos.', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.Servicio WHERE id_servicio = @id_servicio)
    THROW 50002, 'Servicio no válido.', 1;

  DECLARE @id_cliente INT;

  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  BEGIN TRANSACTION;

  SELECT TOP (1) @id_cliente = id_cliente
  FROM dbo.Cliente WITH (UPDLOCK, HOLDLOCK)
  WHERE email = LOWER(LTRIM(RTRIM(@email)));

  IF @id_cliente IS NULL
  BEGIN
    INSERT INTO dbo.Cliente (nombre, apellido, empresa, email)
    VALUES (
      LTRIM(RTRIM(@nombre)),
      LTRIM(RTRIM(@apellido)),
      NULLIF(LTRIM(RTRIM(@empresa)), ''),
      LOWER(LTRIM(RTRIM(@email)))
    );

    SET @id_cliente = SCOPE_IDENTITY();
  END;

  INSERT INTO dbo.Solicitud
    (fecha, asunto, mensaje, estado, id_cliente, id_servicio)
  VALUES
    (CAST(GETDATE() AS DATE), LTRIM(RTRIM(@asunto)), LTRIM(RTRIM(@mensaje)),
     'nuevo', @id_cliente, @id_servicio);

  DECLARE @id_solicitud INT = SCOPE_IDENTITY();
  COMMIT TRANSACTION;

  SELECT @id_solicitud AS id_solicitud;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_ListarSolicitudes
  @estado VARCHAR(30) = '',
  @q VARCHAR(100) = ''
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    s.id_solicitud,
    CONVERT(VARCHAR(10), s.fecha, 23) AS fecha,
    c.nombre,
    c.apellido,
    ISNULL(c.empresa, '') AS empresa,
    c.email,
    sv.nombre_servicio AS servicio,
    s.asunto,
    CAST(s.mensaje AS VARCHAR(2000)) AS mensaje,
    s.estado
  FROM dbo.Solicitud AS s
  INNER JOIN dbo.Cliente AS c ON c.id_cliente = s.id_cliente
  INNER JOIN dbo.Servicio AS sv ON sv.id_servicio = s.id_servicio
  WHERE (@estado = '' OR s.estado = @estado)
    AND (
      @q = '' OR
      CONCAT(
        ISNULL(c.nombre, ''), ' ', ISNULL(c.apellido, ''), ' ',
        ISNULL(c.email, ''), ' ', ISNULL(c.empresa, ''), ' ',
        ISNULL(s.asunto, ''), ' ', ISNULL(CAST(s.mensaje AS VARCHAR(2000)), '')
      ) LIKE '%' + @q + '%'
    )
  ORDER BY s.id_solicitud DESC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_ActualizarEstadoSolicitud
  @id INT,
  @estado VARCHAR(30)
AS
BEGIN
  SET NOCOUNT ON;

  IF @id <= 0 OR @estado NOT IN ('nuevo', 'en proceso', 'cerrado')
    THROW 50003, 'Identificador o estado no válido.', 1;

  UPDATE dbo.Solicitud
  SET estado = @estado
  WHERE id_solicitud = @id;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EliminarSolicitud
  @id INT
AS
BEGIN
  SET NOCOUNT ON;

  IF @id <= 0
    THROW 50004, 'Identificador no válido.', 1;

  DELETE FROM dbo.Solicitud WHERE id_solicitud = @id;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_ListarOfertas
AS
BEGIN
  SET NOCOUNT ON;
  SELECT * FROM dbo.OfertasMesTarea WHERE Vigente = 1;
END;
GO

IF DATABASE_PRINCIPAL_ID('web_public_role') IS NULL
  CREATE ROLE web_public_role AUTHORIZATION dbo;
GO

IF DATABASE_PRINCIPAL_ID('web_admin_role') IS NULL
  CREATE ROLE web_admin_role AUTHORIZATION dbo;
GO

-- Las cuentas de la aplicación no pueden consultar ni modificar tablas directamente.
DENY SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO web_public_role;
DENY SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO web_admin_role;
GO

GRANT EXECUTE ON OBJECT::dbo.usp_CrearSolicitud TO web_public_role;
GRANT EXECUTE ON OBJECT::dbo.usp_ListarOfertas TO web_public_role;
GO

GRANT EXECUTE ON OBJECT::dbo.usp_CrearSolicitud TO web_admin_role;
GRANT EXECUTE ON OBJECT::dbo.usp_ListarOfertas TO web_admin_role;
GRANT EXECUTE ON OBJECT::dbo.usp_ListarSolicitudes TO web_admin_role;
GRANT EXECUTE ON OBJECT::dbo.usp_ActualizarEstadoSolicitud TO web_admin_role;
GRANT EXECUTE ON OBJECT::dbo.usp_EliminarSolicitud TO web_admin_role;
GO

/*
  Asigna aquí las dos identidades reales usadas por Node.js. Ejemplos:

  CREATE USER [DOMINIO\DylanWebPublic] FOR LOGIN [DOMINIO\DylanWebPublic];
  ALTER ROLE web_public_role ADD MEMBER [DOMINIO\DylanWebPublic];

  CREATE USER [DOMINIO\DylanWebAdmin] FOR LOGIN [DOMINIO\DylanWebAdmin];
  ALTER ROLE web_admin_role ADD MEMBER [DOMINIO\DylanWebAdmin];

  Después configura DB_PUBLIC_CONNECTION_STRING y DB_ADMIN_CONNECTION_STRING
  para que cada pool use su identidad correspondiente.
*/
