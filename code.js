// Figma to Rust UI Exporter

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'export-ui') {
    const shouldExportImages = msg.exportImages !== undefined ? msg.exportImages : true;
    const autoIncludeImages = msg.autoIncludeImages !== undefined ? msg.autoIncludeImages : true;
    const useBase64 = msg.useBase64 !== undefined ? msg.useBase64 : true;
    
    const result = await exportToRustUI(shouldExportImages, autoIncludeImages, useBase64);
    figma.ui.postMessage({ type: 'export-complete', data: result });
  } else if (msg.type === 'close') {
    figma.closePlugin();
  }
};


figma.showUI(__html__, { width: 450, height: 600 });


figma.on('run', ({ command }) => {
  if (command === 'export-ui') {
    figma.ui.postMessage({ type: 'show-export' });
  } else if (command === 'settings') {
    figma.ui.postMessage({ type: 'show-settings' });
  }
});


async function exportToRustUI(shouldExportImages = true, autoIncludeImages = true, useBase64 = true) {
  
  if (figma.currentPage.selection.length === 0) {
    return { success: false, error: 'Пожалуйста, выберите хотя бы один фрейм.' };
  }

  
  const selectedNode = figma.currentPage.selection[0];
  
  
  if (selectedNode.type !== 'FRAME') {
    return { 
      success: false, 
      error: 'Выбранный элемент должен быть фреймом. Используйте фреймы (Shift+A) вместо групп.' 
    };
  }

  
  const rootName = selectedNode.name;
  if (rootName !== 'Overlay' && rootName !== 'Hud') {
    return { 
      success: false, 
      error: 'Корневой фрейм должен называться точно "Overlay" или "Hud" (с учетом регистра).' 
    };
  }

  try {
    
    let imageData = [];
    
    if (shouldExportImages) {
      
      const imageNodes = [];
      collectImageNodes(selectedNode, imageNodes);
      
      
      imageData = await exportImages(imageNodes, useBase64);
    }
    
    
    const uiTree = await processNode(selectedNode);
    
    
    const rustCode = generateRustUICode(uiTree, autoIncludeImages ? imageData : []);
    
    return { 
      success: true, 
      code: rustCode,
      images: imageData 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}


function collectImageNodes(node, imageNodes) {
  
  if (node.fills && node.fills.some(fill => fill.type === 'IMAGE')) {
    imageNodes.push(node);
  }
  
  
  if (node.type === 'RECTANGLE' || node.type === 'ELLIPSE' || node.type === 'POLYGON' || 
      node.type === 'VECTOR' || node.type === 'STAR' || node.type === 'INSTANCE') {
    if (node.fillStyleId || (node.fills && node.fills.some(fill => fill.type === 'IMAGE'))) {
      imageNodes.push(node);
    }
  }
  
  
  if ('children' in node) {
    for (const child of node.children) {
      if (child.visible) {
        collectImageNodes(child, imageNodes);
      }
    }
  }
}


async function exportImages(imageNodes, useBase64 = false) {
  const imageData = [];
  
  for (let i = 0; i < imageNodes.length; i++) {
    const node = imageNodes[i];
    
    try {
      // Создаем уникальное имя для изображения на основе ID узла
      const imageName = `${sanitizeImageName(node.name)}_${node.id.replace(':', '_')}`;
      
      // Настраиваем экспорт в формате PNG
      await node.exportAsync({
        format: 'PNG',
        constraint: { type: 'SCALE', value: 1 }
      }).then(bytes => {
        
        imageData.push({
          id: node.id,
          name: node.name,
          fileName: `${imageName}.png`,
          imageBytes: bytes,
          width: node.width,
          height: node.height
        });
      });
    } catch (error) {
      console.error(`Ошибка при экспорте изображения ${node.name}:`, error);
    }
  }
  
  return imageData;
}


function sanitizeImageName(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}


async function processNode(node, parentId = null) {
  
  const horizontalConstraint = node.constraints && node.constraints.horizontal ? node.constraints.horizontal : 'SCALE';
  const verticalConstraint = node.constraints && node.constraints.vertical ? node.constraints.vertical : 'SCALE';

 
  const nodeData = {
    id: node.id,
    name: node.name,
    type: node.type,
    parentId: parentId,
    children: [],
    constraints: {
      horizontal: horizontalConstraint,
      vertical: verticalConstraint
    },
    position: {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height
    },
    
    isButton: node.name.toLowerCase().includes('button') || 
              (node.fills && node.fills.some(fill => fill.type === 'SOLID' && fill.opacity > 0)),
   
    events: {
      onClick: node.name.toLowerCase().includes('button') ? `button.click ${node.name}` : null,
      onHover: null,
      onLeave: null
    }
  };


  if (node.fills && node.fills.some(fill => fill.type === 'IMAGE')) {
    nodeData.hasImage = true;
    nodeData.imageId = node.id;
  }

  
  if (node.fills && node.fills.length > 0) {
    
    const imageFill = node.fills.find(fill => fill.type === 'IMAGE');
    if (imageFill) {
      nodeData.hasImage = true;
      nodeData.imageId = node.id;
    } else if (node.fills[0].type === 'SOLID') {
      // Если нет изображения, используем цвет
      const fill = node.fills[0];
      nodeData.backgroundColor = {
        r: Math.round(fill.color.r * 255),
        g: Math.round(fill.color.g * 255),
        b: Math.round(fill.color.b * 255),
        a: fill.opacity !== undefined ? fill.opacity : 1
      };
    }
  }

  
  if (node.type === 'TEXT') {
    nodeData.text = node.characters;
    nodeData.fontSize = node.fontSize;
    nodeData.fontWeight = node.fontWeight;
    nodeData.textAlignHorizontal = node.textAlignHorizontal;
    nodeData.textAlignVertical = node.textAlignVertical;
    
    
    if (node.fills && node.fills.length > 0 && node.fills[0].type === 'SOLID') {
      const fill = node.fills[0];
      nodeData.textColor = {
        r: Math.round(fill.color.r * 255),
        g: Math.round(fill.color.g * 255),
        b: Math.round(fill.color.b * 255),
        a: fill.opacity !== undefined ? fill.opacity : 1
      };
    }
  }

 
  if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
    nodeData.cornerRadius = node.cornerRadius;
  }

  
  if (node.effects && node.effects.length > 0) {
    nodeData.effects = node.effects.map(effect => {
      if (effect.type === 'DROP_SHADOW') {
        const offsetX = effect.offset && effect.offset.x ? effect.offset.x : 0;
        const offsetY = effect.offset && effect.offset.y ? effect.offset.y : 0;
        
        return {
          type: 'shadow',
          offsetX: offsetX,
          offsetY: offsetY,
          radius: effect.radius,
          color: {
            r: Math.round(effect.color.r * 255),
            g: Math.round(effect.color.g * 255),
            b: Math.round(effect.color.b * 255),
            a: effect.color.a
          }
        };
      }
      return null;
    }).filter(e => e !== null);
  }

 
  if ('children' in node) {
    for (const child of node.children) {
   
      if (!child.visible) continue;
      
      const childData = await processNode(child, node.id);
      nodeData.children.push(childData);
    }
  }

  return nodeData;
}

// Генерация кода Rust UI на основе обработанного дерева узлов
function generateRustUICode(uiTree, imageData = []) {
  let code = 'using Oxide.Game.Rust.Cui;\nusing UnityEngine;\nusing System;\nusing System.Collections.Generic;\n\n';
  code += '// Code generated by Figma to Rust UI Exporter\n';
  code += '// Этот код был автоматически сгенерирован из Figma дизайна\n\n';
  
  // Добавляем словарь для хранения ссылок на элементы
  code += '// Словарь для хранения ссылок на элементы UI\n';
  code += 'private Dictionary<string, CuiElement> uiElements = new Dictionary<string, CuiElement>();\n\n';
  
  
  if (imageData.length > 0) {
    code += '// Словарь для хранения данных изображений\n';
    code += 'private Dictionary<string, string> imageData = new Dictionary<string, string>();\n\n';
    
    
    code += '// Метод для инициализации данных изображений\n';
    code += 'private void InitializeImageData()\n{\n';
    
    
    for (const image of imageData) {
      const imageName = sanitizeImageName(image.name);
      const fileNameBase = `${imageName}_${image.id.replace(':', '_')}`;
      
     
      const base64Image = figma.base64Encode(image.imageBytes);
      
      code += `    // Изображение: ${image.name}\n`;
      code += `    imageData["${fileNameBase}"] = "${base64Image}";\n`;
    }
    
    code += '}\n\n';
  }
  
  
  function sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9]/g, '');
  }
  
  
  function generateElementCode(node, parentVar = null, indent = 0) {
    const spaces = ' '.repeat(indent);
    const varName = sanitizeName(node.name);
    
    
    let elementType = 'CuiElement';
    if (node.type === 'TEXT') {
      elementType = 'CuiLabel';
    } else if (node.hasImage) {
      elementType = 'CuiRawImage';
    } else if (node.isButton) {
      elementType = 'CuiButton';
    }
    
    let elementCode = `${spaces}var ${varName} = new ${elementType}\n${spaces}{\n`;
    
    
    elementCode += `${spaces}  Name = "${node.name}",\n`;
    
    
    if (parentVar) {
      elementCode += `${spaces}  Parent = ${parentVar},\n`;
    } else {
      
      elementCode += `${spaces}  Parent = "${node.name}",\n`;
    }
    
    
    elementCode += `${spaces}  RectTransform = {\n`;
    
    
    let anchorMin = 'new Vector2(0, 0)';
    let anchorMax = 'new Vector2(1, 1)';
    
    
    switch (node.constraints.horizontal) {
      case 'LEFT':
        anchorMin = 'new Vector2(0, 0)';
        anchorMax = 'new Vector2(0, 1)';
        break;
      case 'RIGHT':
        anchorMin = 'new Vector2(1, 0)';
        anchorMax = 'new Vector2(1, 1)';
        break;
      case 'CENTER':
        anchorMin = 'new Vector2(0.5, 0)';
        anchorMax = 'new Vector2(0.5, 1)';
        break;
      case 'SCALE':
      case 'STRETCH':
        anchorMin = 'new Vector2(0, 0)';
        anchorMax = 'new Vector2(1, 1)';
        break;
    }
    
    // Вертикальные ограничения
    switch (node.constraints.vertical) {
      case 'TOP':
        anchorMin = anchorMin.replace(', 0)', ', 1)');
        anchorMax = anchorMax.replace(', 1)', ', 1)');
        break;
      case 'BOTTOM':
        anchorMin = anchorMin.replace(', 0)', ', 0)');
        anchorMax = anchorMax.replace(', 1)', ', 0)');
        break;
      case 'CENTER':
        anchorMin = anchorMin.replace(', 0)', ', 0.5)');
        anchorMax = anchorMax.replace(', 1)', ', 0.5)');
        break;
    }
    
    elementCode += `${spaces}    AnchorMin = ${anchorMin},\n`;
    elementCode += `${spaces}    AnchorMax = ${anchorMax},\n`;
    
    
    elementCode += `${spaces}    OffsetMin = "0 0",\n`;
    elementCode += `${spaces}    OffsetMax = "${node.position.width} ${node.position.height}"\n`;
    elementCode += `${spaces}  },\n`;
    
    
    if (node.type === 'TEXT') {
      elementCode += `${spaces}  Text = {\n`;
      elementCode += `${spaces}    Text = "${node.text || node.name}",\n`;
      elementCode += `${spaces}    FontSize = ${node.fontSize || 14},\n`;
      
      // Выравнивание текста
      let textAlign = 'TextAnchor.MiddleCenter';
      if (node.textAlignHorizontal === 'LEFT') {
        if (node.textAlignVertical === 'TOP') textAlign = 'TextAnchor.UpperLeft';
        else if (node.textAlignVertical === 'BOTTOM') textAlign = 'TextAnchor.LowerLeft';
        else textAlign = 'TextAnchor.MiddleLeft';
      } else if (node.textAlignHorizontal === 'RIGHT') {
        if (node.textAlignVertical === 'TOP') textAlign = 'TextAnchor.UpperRight';
        else if (node.textAlignVertical === 'BOTTOM') textAlign = 'TextAnchor.LowerRight';
        else textAlign = 'TextAnchor.MiddleRight';
      } else {
        if (node.textAlignVertical === 'TOP') textAlign = 'TextAnchor.UpperCenter';
        else if (node.textAlignVertical === 'BOTTOM') textAlign = 'TextAnchor.LowerCenter';
        else textAlign = 'TextAnchor.MiddleCenter';
      }
      
      elementCode += `${spaces}    Align = ${textAlign},\n`;
      
      // Цвет текста
      if (node.textColor) {
        elementCode += `${spaces}    Color = "${node.textColor.r} ${node.textColor.g} ${node.textColor.b} ${node.textColor.a}"\n`;
      } else {
        elementCode += `${spaces}    Color = "255 255 255 1"\n`;
      }
      
      elementCode += `${spaces}  },\n`;
    }
    
    else if (node.hasImage && imageData.length > 0) {
      const imageInfo = imageData.find(img => img.id === node.imageId);
      
      if (imageInfo) {
        const imageName = sanitizeImageName(imageInfo.name);
        const fileNameBase = `${imageName}_${imageInfo.id.replace(':', '_')}`;
        
        elementCode += `${spaces}  Raw = {\n`;
        elementCode += `${spaces}    Png = imageData["${fileNameBase}"]\n`;
        elementCode += `${spaces}  }\n`;
      } else {
        elementCode += `${spaces}  Image = {\n`;
        elementCode += `${spaces}    Color = "255 255 255 0"\n`;
        elementCode += `${spaces}  }\n`;
      }
    }
    // Для кнопок
    else if (node.isButton) {
      elementCode += `${spaces}  Button = {\n`;
      elementCode += `${spaces}    Command = "button.click ${node.name}",\n`;
      elementCode += `${spaces}    Color = "${node.backgroundColor ? `${node.backgroundColor.r} ${node.backgroundColor.g} ${node.backgroundColor.b} ${node.backgroundColor.a}` : '255 255 255 1'}"\n`;
      elementCode += `${spaces}  }\n`;
    }
    // Для остальных элементов
    else {
      elementCode += `${spaces}  Image = {\n`;
      
      if (node.backgroundColor) {
        elementCode += `${spaces}    Color = "${node.backgroundColor.r} ${node.backgroundColor.g} ${node.backgroundColor.b} ${node.backgroundColor.a}"\n`;
      } else {
        elementCode += `${spaces}    Color = "255 255 255 0"\n`;
      }
      
      elementCode += `${spaces}  }\n`;
    }
    
    elementCode += `${spaces}};\n`;
    
    
    elementCode += `${spaces}uiElements["${node.name}"] = ${varName};\n\n`;
    
    
    for (const child of node.children) {
      elementCode += generateElementCode(child, varName, indent);
    }
    
    return elementCode;
  }
  
 
  code += generateElementCode(uiTree);
  
  
  code += '\n// Функция для добавления UI\n';
  code += 'private void CreateUI(BasePlayer player)\n{\n';
  
  
  if (imageData.length > 0) {
    code += '    // Инициализируем данные изображений\n';
    code += '    InitializeImageData();\n\n';
  }
  
  code += '    var elements = new CuiElementContainer();\n';
  code += `    elements.Add(${sanitizeName(uiTree.name)});\n`;
  
  
  function addChildren(node, indent = 1) {
    let childCode = '';
    const spaces = ' '.repeat(indent * 4);
    
    for (const child of node.children) {
      childCode += `${spaces}elements.Add(${sanitizeName(child.name)});\n`;
      if (child.children && child.children.length > 0) {
        childCode += addChildren(child, indent + 1);
      }
    }
    
    return childCode;
  }
  
 
  code += addChildren(uiTree);
  
  code += '    CuiHelper.AddUi(player, elements);\n';
  code += '}\n';
  
 
  code += '\n// Функция для удаления UI\n';
  code += 'private void DestroyUI(BasePlayer player)\n{\n';
  code += `    CuiHelper.DestroyUi(player, "${uiTree.name}");\n`;
  code += '}\n';
  
 
  code += '\n// Функция для обновления UI\n';
  code += 'private void UpdateUI(BasePlayer player)\n{\n';
  code += '    DestroyUI(player);\n';
  code += '    CreateUI(player);\n';
  code += '}\n';
  
 
  code += '\n// Функция для обработки событий кнопок\n';
  code += 'private void OnButtonClick(BasePlayer player, string buttonName)\n{\n';
  code += '    // Здесь можно добавить обработку нажатий на кнопки\n';
  code += '    // Например:\n';
  code += '    // if (buttonName == "ButtonName") {\n';
  code += '    //     // Действие при нажатии\n';
  code += '    // }\n';
  code += '}\n';
  
  return code;
} 